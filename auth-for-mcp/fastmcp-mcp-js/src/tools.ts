import { withAuth0Execute } from "@auth0/ai-fastmcp";
import type { Auth0Session } from "@auth0/ai-fastmcp";
import type { FastMCP } from "fastmcp";
import { z } from "zod";

export const MCP_TOOL_SCOPES = ["tool:greet", "tool:whoami"];

/**
 * Registers the tools. `withAuth0Execute` hands each tool the caller that was verified for the
 * request and enforces `requiredScopes`: a caller without the scope gets an error result for
 * that tool only, and the other tools stay available.
 */
export function registerTools(server: FastMCP<Auth0Session>): void {
  server.addTool({
    name: "greet",
    description: "Greet a user with personalized authentication information from Auth0.",
    annotations: { title: "Greet User (FastMCP)", readOnlyHint: true },
    parameters: z.object({
      name: z.string().optional().describe("The name of the person to greet (optional)."),
    }),
    execute: withAuth0Execute(
      async ({ name }, { session }) =>
        `Hello, ${name ?? "there"} (${session.principal.sub})!\n\nFastMCP with Auth0 OAuth integration is working!`,
      { requiredScopes: "tool:greet" },
    ),
  });

  server.addTool({
    name: "whoami",
    description: "Returns information about the authenticated user",
    annotations: { title: "Who Am I? (FastMCP)", readOnlyHint: true },
    parameters: z.object({}),
    execute: withAuth0Execute(
      async (_args, { session }) =>
        JSON.stringify(
          {
            user: { sub: session.principal.sub, clientId: session.principal.clientId },
            scopes: session.scopes,
          },
          null,
          2,
        ),
      { requiredScopes: "tool:whoami" },
    ),
  });

  // This tool does not require any scope.
  server.addTool({
    name: "get_datetime",
    description: "Returns the current UTC date and time",
    annotations: { title: "Get DateTime", readOnlyHint: true },
    parameters: z.object({}),
    execute: async () => new Date().toISOString(),
  });
}
