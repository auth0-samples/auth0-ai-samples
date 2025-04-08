import { NextRequest } from "next/server";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { googleCalendarViewTool } from "@/lib/tools/google-calendar-view";

export async function POST(req: NextRequest) {
  // Get user prompt from request.
  const { prompt }: { prompt: string } = await req.json();

  // Initiates a streaming AI response.
  const result = streamText({
    prompt,
    model: openai("gpt-4o-mini"),
    // Provides external tools the model can call.
    // In this case, Google Calendar integration.
    tools: { googleCalendarViewTool },
    maxSteps: 2,
    onError({ error }) {
      console.error("streamText error", { error });
    },
  });

  // Converts the streaming result into a Next.js-compatible response.
  return result.toDataStreamResponse();
}
