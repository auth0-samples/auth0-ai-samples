import { NextRequest } from 'next/server';
import { streamText, UIMessage, createUIMessageStream, createUIMessageStreamResponse, convertToModelMessages, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { setAIContext } from '@auth0/ai-vercel';

const date = new Date().toISOString();

const AGENT_SYSTEM_TEMPLATE = `You are a personal assistant named Assistant0. You are a helpful assistant that can answer questions and help with tasks. You have access to a set of tools, use the tools as needed to answer the user's question. Render the email body as a markdown block, do not wrap it in code blocks. The current date and time is ${date}`;

/**
 * This handler initializes and calls an tool calling agent.
 */
export async function POST(req: NextRequest) {
  const { id, messages }: { id: string; messages: Array<UIMessage> } = await req.json();
  setAIContext({ threadID: id });
  const tools = {};

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      const result = streamText({
        model: openai('gpt-4o-mini'),
        system: AGENT_SYSTEM_TEMPLATE,
        messages: await convertToModelMessages(messages),
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

