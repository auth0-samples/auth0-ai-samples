import { setAIContext } from "@auth0/ai-vercel";
import crypto from "node:crypto";
import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";

import { buy } from "./lib/tools/buy";

async function main() {
  const threadID = crypto.randomUUID();
  setAIContext({ threadID });

  const userPrompt = "Use the buy tool to purchase 3 shares of Google (GOOGL) stock";

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: "You are an assistant. Invoke the tool if needed, then respond with a past-tense confirmation.",
    prompt: userPrompt,
    // pass an Auth0 user id. For example, 'auth0|100000000000000000000' or 'google-oauth2|100000000000000000000'
    tools: { buy: buy({ userId: "<authenticated-user-id>" }) },
    stopWhen: stepCountIs(3), // tool call + result + final assistant message
  });

  console.log("Final response:", (text && text.trim()) || "<empty>");
}

main().catch(console.error);
