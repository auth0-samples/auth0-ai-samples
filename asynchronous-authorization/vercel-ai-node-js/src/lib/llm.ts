import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText } from "ai";
import { Context } from "../types/ai-context";
import { buy } from "./tools/buy.ts";

export async function askLLM(messages: CoreMessage[], context: Context) {
  return generateText({
    model: openai("gpt-4o-mini"),
    messages,
    maxSteps: 2,
    tools: {
      buy: buy(context),
    },
  });
}
