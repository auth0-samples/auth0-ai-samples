import { NextRequest } from 'next/server';
import {
  streamText,
  type UIMessage,
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToCoreMessages
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { shopOnlineTool } from '@/lib/tools/shop-online';

const date = new Date().toISOString();
const AGENT_SYSTEM_TEMPLATE =
  `You are a personal assistant named Assistant0. You can call tools. Today is ${date}.`;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const messages = convertToCoreMessages(body.messages as UIMessage[]);
  const tools = { shopOnlineTool };

  const stream = createUIMessageStream({
    async execute({ writer }) {
      const result = streamText({
        model: openai.chat('gpt-4o-mini'),
        system: AGENT_SYSTEM_TEMPLATE,
        messages,
        tools,
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function sanitize(messages: UIMessage[]) {
  return messages.filter(
    (m) =>
      !(
        m.role === 'assistant' &&
        Array.isArray(m.parts) &&
        m.parts.length > 0 &&
        !m.parts.some((p: any) => !!p?.text)
      )
  );
}
