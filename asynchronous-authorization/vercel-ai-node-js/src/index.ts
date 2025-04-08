import { setAIContext } from "@auth0/ai-vercel";
import { askLLM } from "./lib/llm";
import crypto from "node:crypto";

async function main() {
  const threadID = crypto.randomUUID();
  setAIContext({ threadID });
  console.log(
    "Check your mobile device for Auth0 Guardian notification and approve the request"
  );
  const { response, text } = await askLLM(
    [{ role: "user", content: "Buy 3 stocks of Google" }],
    // Provide the Auth0 User Id of the approver. Something like 'auth0|100929229033039630042'
    { userID: "<authenticated-user-id>" }
  );

  console.log(text);
}

main().catch(console.error);
