import { z } from "zod";
import { FastMCP } from "fastmcp";
import { FastMCPAuthSession } from "./types.js";

export const MCP_TOOL_SCOPES = ["tool:greet", "tool:whoami"];

const emptyToolInputSchema = z.object({}).strict();

function hasAllScopes(
  requiredScopes: readonly string[]
): (auth: FastMCPAuthSession) => boolean {
  return (auth: FastMCPAuthSession) => {
    const userScopes = auth.scopes;
    return requiredScopes.every((scope) => userScopes.includes(scope));
  };
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

      return {
        content: [
          {
            type: "text",
            text: `Hello, ${userName} (${authInfo?.extra?.sub})!

FastMCP with Auth0 OAuth integration is working!
Authentication and scope checks are working correctly.`.trim(),
          },
        ],
      };
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
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    },
  });

  // This tool does not require any scopes
  mcpServer.addTool({
    name: "get_datetime",
    description: "Returns the current UTC date and time",
    annotations: {
      title: "Get DateTime",
      readOnlyHint: true,
    },
    parameters: emptyToolInputSchema,
    execute: async () => {
      const utcDateTime = new Date().toISOString();
      return {
        content: [
          {
            type: "text",
            text: utcDateTime,
          },
        ],
      };
    },
  });
}
