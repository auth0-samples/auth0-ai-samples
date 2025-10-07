import { NextRequest } from 'next/server';
import { streamText, UIMessage, createUIMessageStream, createUIMessageStreamResponse, convertToModelMessages, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';

const date = new Date().toISOString();

const AGENT_SYSTEM_TEMPLATE = `You are a personal assistant named Assistant0. You are a helpful assistant that can answer questions and help with tasks. You have access to a set of tools, use the tools as needed to answer the user's question. Render the email body as a markdown block, do not wrap it in code blocks. Today is ${date}.`;

/**
 * This handler initializes and calls an tool calling agent.
 */
export async function POST(req: NextRequest) {
  const request = await req.json();

  const messages = sanitizeMessages(request.messages);

  const tools = {};

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      const result = streamText({
        model: openai('gpt-4o-mini'),
        system: AGENT_SYSTEM_TEMPLATE,
        messages: convertToModelMessages(messages),
        stopWhen: stepCountIs(5),
        tools,
      });

      writer.merge(
        result.toUIMessageStream({
          sendReasoning: true,
        })
      );
    },
    onError: (err: any) => {
      console.log(err);
      return `An error occurred! ${err.message}`;
    },
  });

  return createUIMessageStreamResponse({ stream });
}

// Vercel AI tends to get stuck when there are incomplete tool calls in messages
const sanitizeMessages = (messages: UIMessage[]) => {
  return messages.filter(
    (message) => !(message.role === 'assistant' && message.parts && message.parts.length > 0 && (message?.parts?.[0] as unknown as string) === ''),
  );
};
