import { Client } from "@langchain/langgraph-sdk";

export function createClient(apiUrl: string, accessToken: string | null) {
  return new Client({
    apiUrl,
    defaultHeaders: accessToken
      ? {
          Authorization: `Bearer ${accessToken}`,
        }
      : undefined,
  });
}
