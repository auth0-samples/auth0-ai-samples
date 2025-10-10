import { NextRequest } from 'next/server';
import { streamText, UIMessage, createUIMessageStream, createUIMessageStreamResponse, convertToModelMessages } from 'ai';
import { openai } from '@ai-sdk/openai';
import { setAIContext } from '@auth0/ai-vercel';
import { errorSerializer, withInterruptions } from '@auth0/ai-vercel/interrupts';

import { getCalendarEventsTool } from '@/lib/tools/google-calendar';

const date = new Date().toISOString();

const AGENT_SYSTEM_TEMPLATE = `You are a personal assistant named Assistant0. You are a helpful assistant that can answer questions and help with tasks. You have access to a set of tools, use the tools as needed to answer the user's question. Render the email body as a markdown block, do not wrap it in code blocks. Today is ${date}.`;

/**
 * This handler initializes and calls an tool calling agent.
 */
export async function POST(req: NextRequest) {
  const { id, messages }: { id: string; messages: Array<UIMessage> } = await req.json();

  setAIContext({ threadID: id });

  const tools = {
    getCalendarEventsTool,
  };

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: withInterruptions(
      async ({ writer }) => {
        const result = streamText({
          model: openai("gpt-4o-mini"),
          system: AGENT_SYSTEM_TEMPLATE,
          messages: convertToModelMessages(messages),
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
        messages: messages,
        tools,
      }
    ),
    onError: errorSerializer((err) => {
      console.error("ai-sdk route: stream error", err);
      return "Oops, an error occured!";
    }),
  });

  return createUIMessageStreamResponse({ stream });
}
