import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, streamText, UIMessage } from 'ai';
import { NextRequest } from 'next/server';

import { openai } from '@ai-sdk/openai';
import { Auth0Interrupt } from '@auth0/ai/interrupts';
import { InterruptionPrefix } from '@auth0/ai-vercel/interrupts';

import { auth0 } from '@/lib/auth0';
import { collectMcpTools, type CollectedMcpTools } from '@/lib/mcp';

const date = new Date().toISOString();

const AGENT_SYSTEM_TEMPLATE = `You are a personal assistant named Assistant0. You are a helpful assistant that can answer questions and help with tasks, using tools exposed by connected remote MCP servers (such as Notion). Use the tools as needed to answer the user's question. The current date and time is ${date}`;

/**
 * Serializes an Auth0 interrupt (e.g. "connect your Notion account") into the
 * prefixed string the client's useInterruptions() hook decodes to drive the
 * connect-account consent UI. The empty toolCall keeps the hook's destructuring
 * happy for a route-level (non-tool) interrupt that resumes via reload.
 */
function serializeInterrupt(interrupt: Auth0Interrupt): string {
  return `${InterruptionPrefix}${JSON.stringify({ ...interrupt.toJSON(), toolCall: {} })}`;
}

export async function POST(req: NextRequest) {
  const { messages }: { id: string; messages: Array<UIMessage> } = await req.json();

  const modelMessages = await convertToModelMessages(messages);

  let mcp: CollectedMcpTools | undefined;

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      // Token Vault Exchange + remote MCP connection. A not-yet-connected account
      // throws a TokenVaultInterrupt here, caught by onError below and surfaced
      // to the connect-account consent UI.
      mcp = await collectMcpTools(auth0);

      const result = streamText({
        model: openai('gpt-4o-mini'),
        system: AGENT_SYSTEM_TEMPLATE,
        messages: modelMessages,
        tools: mcp.tools,
        onFinish: () => {
          void mcp?.close();
        },
      });
      writer.merge(result.toUIMessageStream({ sendReasoning: true }));
    },
    onError: (err: unknown) => {
      void mcp?.close();
      if (Auth0Interrupt.isInterrupt(err)) {
        return serializeInterrupt(err as Auth0Interrupt);
      }
      console.error('ai-sdk route: stream error', err);
      return 'Oops, an error occured!';
    },
  });

  return createUIMessageStreamResponse({ stream });
}
