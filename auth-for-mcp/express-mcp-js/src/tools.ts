import { getCallerPrincipal, withRequiredScopes } from "@auth0/ai-mcp";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

export const MCP_TOOL_SCOPES = ["tool:greet", "tool:whoami"];

/**
 * Builds the MCP server for one request. A caller without the scope of a tool gets an error
 * result for that tool only; the other tools stay available.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "Example Express MCP Server", version: "1.0.0" });

  server.registerTool(
    "greet",
    {
      title: "Greet Tool",
      description: "Greets a user",
      inputSchema: z.object({
        name: z.string().optional().describe("The name to greet (defaults to 'World')"),
      }),
      annotations: { readOnlyHint: false },
    },
    withRequiredScopes("tool:greet", async ({ name }) => {
      const principal = getCallerPrincipal();
      return {
        content: [
          {
            type: "text" as const,
            text: `Hello, ${name || "World"}! You are authenticated as: ${principal?.sub ?? "unknown"}`,
          },
        ],
      };
    }),
  );

  server.registerTool(
    "whoami",
    {
      title: "Whoami Tool",
      description: "Returns the authenticated user's information",
      annotations: { readOnlyHint: false },
    },
    withRequiredScopes("tool:whoami", async () => {
      const principal = getCallerPrincipal();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { user: { sub: principal?.sub, clientId: principal?.clientId }, scopes: principal?.scopes },
              null,
              2,
            ),
          },
        ],
      };
    }),
  );

  // This tool does not require any scope.
  server.registerTool(
    "get_datetime",
    {
      title: "Get DateTime",
      description: "Returns the current UTC date and time",
      annotations: { readOnlyHint: true },
    },
    async () => ({ content: [{ type: "text" as const, text: new Date().toISOString() }] }),
  );

  return server;
}
