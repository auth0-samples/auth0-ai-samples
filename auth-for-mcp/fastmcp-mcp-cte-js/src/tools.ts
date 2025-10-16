import { z } from "zod";
import { FastMCP } from "fastmcp";
import { FastMCPAuthSession } from "./types.js";
import { exchangeCustomToken } from "./auth0.js";

export const MCP_TOOL_SCOPES = ["tool:greet", "tool:whoami", "tool:cte"];

function hasAllScopes(
  requiredScopes: readonly string[]
): (auth: FastMCPAuthSession) => boolean {
  return (auth: FastMCPAuthSession) => {
    const userScopes = auth.scopes;
    return requiredScopes.every((scope) => userScopes.includes(scope));
  };
}

async function bearerForUpstream(subjectToken: string) {
  if (!subjectToken) return { token: null, scopes: null };

  try {
    const result = await exchangeCustomToken(subjectToken);
    return {
      token: result.accessToken,
      scopes: result.scope,
    }
  } catch (err) {
    console.error('Error during token exchange:', err);
    throw err;
  }
}

export function registerTools(mcpServer: FastMCP<FastMCPAuthSession>) {
  mcpServer.addTool({
    name: "greet",
    description:
      "Greet a user with personalized authentication information from Auth0.",
    annotations: {
      title: "Greet User (FastMCP)",
      readOnlyHint: true,
    },
    parameters: z.object({
      name: z
        .string()
        .optional()
        .describe("The name of the person to greet (optional)."),
    }),
    canAccess: hasAllScopes(["tool:greet"]),
    execute: async (args, { session: authInfo }) => {
      const { name } = args;
      const userName = name ?? "there";

      console.log(`Greet tool invoked for user: ${authInfo?.extra?.sub}`);

      return `
        Hello, ${userName} (${authInfo?.extra?.sub})!

        FastMCP with Auth0 OAuth integration is working!
        Authentication and scope checks are working correctly.
        `.trim();
    },
  });

  mcpServer.addTool({
    name: "whoami",
    description: "Returns information about the authenticated user",
    annotations: {
      title: "Who Am I? (FastMCP)",
      readOnlyHint: true,
    },
    canAccess: hasAllScopes(["tool:whoami"]),
    execute: async (_args, { session: authInfo }) => {
      const info = { user: authInfo?.extra, scopes: authInfo?.scopes };
      return JSON.stringify(info, null, 2);
    },
  });

  mcpServer.addTool({
    name: 'cte',
    description: 'Custom Token Exchange example tool',
    annotations: {
      title: 'Custom Token Exchange (CTE) Example Tool',
      readOnlyHint: true,
    },
    canAccess: hasAllScopes(['tool:cte']),
    execute: async (_args, { session: authInfo }) => {
      const sourceToken = authInfo!.token;
      const { token: bearer, scopes } = await bearerForUpstream(sourceToken);
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${bearer}` };

      // Call to an upstream API using the exchanged token
      const res = await fetch(`${process.env.API_BASE_URL}/api/private-scope`, {
        method: 'GET',
        headers,
      });
      const result = await res.json();
      console.log('Upstream API response:', result);
      return JSON.stringify(result, null, 2);
    },
  })
}
