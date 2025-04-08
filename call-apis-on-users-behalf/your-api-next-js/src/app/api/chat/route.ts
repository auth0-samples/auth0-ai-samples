import { getUserInfoTool } from "@/lib/tools/user-info";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export async function POST(req: Request) {
  const { messages } = await req.json();

  // streamText is used to run the request
  const result = streamText({
    model: openai("gpt-4o-mini"),
    maxSteps: 2,
    tools: {
      userInfo: getUserInfoTool,
    },
    messages,
    system: "You are an AI agent for tool calling with Auth0.",
  });

  return result.toDataStreamResponse();
}
