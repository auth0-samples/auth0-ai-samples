import { NextRequest } from 'next/server';
import {
  streamText,
  type UIMessage,
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
} from 'ai';

import { setAIContext } from '@auth0/ai-vercel';
import { openai } from '@ai-sdk/openai';
import { shopOnlineTool } from '@/lib/tools/shop-online';

const date = new Date().toISOString();
const AGENT_SYSTEM_TEMPLATE = `You are a personal assistant named Assistant0. You are a helpful assistant that can answer questions and help with tasks. 
You have access to a set of tools. When using tools, you MUST provide valid JSON arguments. Always format tool call arguments as proper JSON objects.
For example, when calling shop_online tool, format like this:
{"product": "iPhone", "qty": 1, "priceLimit": 1000}
Use the tools as needed to answer the user's question. Render the email body as a markdown block, do not wrap it in code blocks. The current date and time is ${date}`;

export async function POST(req: NextRequest) {
  const { id, messages }: { id: string; messages: Array<UIMessage> } = await req.json();

  const sanitizedMessages = sanitize(messages);
  const tools = { shopOnlineTool };

  setAIContext({ threadID: id });

  const stream = createUIMessageStream({
    async execute({ writer }) {
      const result = streamText({
        model: openai.chat('gpt-4o-mini'),
        system: AGENT_SYSTEM_TEMPLATE,
        messages: await convertToModelMessages(sanitizedMessages),
        tools,
      });

      writer.merge(
        result.toUIMessageStream({
          sendReasoning: true,
        }),
      );
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function sanitize(messages: UIMessage[]) {
  return messages.filter(
    (m) =>
      !(m.role === 'assistant' && Array.isArray(m.parts) && m.parts.length > 0 && !m.parts.some((p: any) => !!p?.text)),
  );
}
