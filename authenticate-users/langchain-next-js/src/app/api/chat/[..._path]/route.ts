import { initApiPassthrough } from "langgraph-nextjs-api-passthrough";
import { NextRequest } from "next/server";

import { auth0 } from "@/lib/auth0";

async function getAccessToken() {
  const tokenResult = await auth0.getAccessToken();
  if (!tokenResult?.token) {
    throw new Error("Error retrieving access token for langgraph api.");
  }
  return tokenResult.token;
}

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS, runtime } =
  initApiPassthrough({
    apiUrl: process.env.LANGGRAPH_API_URL,
    apiKey: process.env.LANGSMITH_API_KEY,
    runtime: "edge",
    baseRoute: "chat/",
    headers: async (req: NextRequest) => {
      const headers: Record<string, string> = {};
      req.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const accessToken = await getAccessToken();
      headers["Authorization"] = `Bearer ${accessToken}`;
      return headers;
    },
  });