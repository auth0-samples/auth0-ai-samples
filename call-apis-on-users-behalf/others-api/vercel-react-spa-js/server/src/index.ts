import "dotenv/config";

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  streamText,
} from "ai";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { openai } from "@ai-sdk/openai";
import { setAIContext } from "@auth0/ai-vercel";
import {
  errorSerializer,
  withInterruptions,
} from "@auth0/ai-vercel/interrupts";
import { serve } from "@hono/node-server";

import { createGoogleCalendarTool } from "./lib/auth";
import { createListNearbyEventsTool } from "./lib/tools/listNearbyEvents";
import { createListUserCalendarsTool } from "./lib/tools/listUserCalendars";
import { jwtAuthMiddleware } from "./middleware/auth";

import type { ApiResponse } from "@auth0/auth0-ai-js-examples-react-hono-ai-sdk-shared";

const getAllowedOrigins = (): string[] => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (!allowedOrigins) {
    // Fallback to default origins if not set
    return ["http://localhost:5173", "http://localhost:3000"];
  }
  return allowedOrigins.split(",").map((origin) => origin.trim());
};

export const app = new Hono()

  .use(
    cors({
      origin: getAllowedOrigins(),
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    })
  )

  .get("/", (c) => {
    return c.text("Hello Hono!");
  })

  .get("/hello", async (c) => {
    const data: ApiResponse = {
      message: "Hello!",
      success: true,
    };
    console.log("✅ Success! Public /hello route called!");
    return c.json(data, { status: 200 });
  })

  // Protected API route
  .get("/api/external", jwtAuthMiddleware(), async (c) => {
    const auth = c.get("auth");

    const data: ApiResponse = {
      message: `Your access token was successfully validated! Welcome ${auth?.jwtPayload.sub}`,
      success: true,
    };

    return c.json(data, { status: 200 });
  })

  .post("/chat", jwtAuthMiddleware(), async (c) => {
    const auth = c.get("auth");

    console.log("🔐 Authenticated user:", auth?.jwtPayload.sub);

    const { messages: requestMessages } = await c.req.json();

    // Generate a thread ID for this conversation
    const threadID = generateId();

    // Set AI context for the tools to access
    setAIContext({ threadID });

    // Create the Google Calendar wrapper with auth context
    const googleCalendarWrapper = createGoogleCalendarTool(c);

    // Create tools with the auth context
    const listNearbyEvents = createListNearbyEventsTool(googleCalendarWrapper);
    const listUserCalendars = createListUserCalendarsTool(
      googleCalendarWrapper
    );

    // Use the messages from the request directly
    const tools = { listNearbyEvents, listUserCalendars };

    // note: you can see more examples of Hono API consumption with AI SDK here:
    // https://ai-sdk.dev/cookbook/api-servers/hono?utm_source=chatgpt.com#hono

    const modelMessages = convertToModelMessages(requestMessages);
    const date = new Date().toISOString();

    const stream = createUIMessageStream({
      originalMessages: requestMessages,
      execute: withInterruptions(
        async ({ writer }) => {
          const result = streamText({
            model: openai("gpt-4o-mini"),
            system:
              `You are a helpful calendar assistant! You can help users with their calendar events and schedules. Keep your responses concise and helpful. Always format your responses as plain text. Do not use markdown formatting like **bold**, ##headers, or -bullet points. Use simple text formatting with line breaks and indentation only. The current date and time is ${date}`,
            messages: modelMessages,
            tools,

            onFinish: (output) => {
              if (output.finishReason === "tool-calls") {
                const lastMessage = output.content[output.content.length - 1];
                if (lastMessage?.type === "tool-error") {
                  const { toolName, toolCallId, error, input } = lastMessage;
                  const serializableError = {
                    cause: error,
                    toolCallId: toolCallId,
                    toolName: toolName,
                    toolArgs: input,
                  };

                  throw serializableError;
                }
              }
            },
          });
          writer.merge(
            result.toUIMessageStream({
              sendReasoning: true,
            })
          );
        },
        {
          messages: requestMessages,
          tools,
        }
      ),
      onError: errorSerializer((err) => {
        console.error("react-hono-ai-sdk route: stream error", err);
        return "Oops, an error occurred!";
      }),
    });

    return createUIMessageStreamResponse({ stream });
  });

// Start the server for Node.js
const port = Number(process.env.PORT) || 3000;

console.log(`🚀 Server starting on port ${port}`);
serve({
  fetch: app.fetch,
  port,
});

console.log(`✅ Server running on http://localhost:${port}`);
