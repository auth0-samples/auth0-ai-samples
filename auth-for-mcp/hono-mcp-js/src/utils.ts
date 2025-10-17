import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { registerTools } from "./tools";
import { Env, Variables } from "./types";

/**
 * Middleware to enforce authentication on protected routes.
 */
export function requireAuth() {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(
    async (c, next) => {
      const authMiddleware = c.get("auth0Mcp").authMiddleware();
      return await authMiddleware(c, next);
    },
  );
}

export function withMcpServer() {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(
    async (c, next) => {
      try {
        const { resourceName, requireScopes } = c.get("auth0Mcp");

        // In stateless mode, create a new instance of transport and server for each request
        // to ensure complete isolation. A single instance would cause request ID collisions
        // when multiple clients connect concurrently.
        const mcpServer = new McpServer({
          name: resourceName,
          version: "1.0.0",
        });

        // Register tools
        const authInfo = c.get("auth");
        registerTools(mcpServer, requireScopes, authInfo);

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });

        await mcpServer.connect(transport);

        // Store server and transport in Hono context
        c.set("mcpServer", mcpServer);
        c.set("mcpTransport", transport);

        await next();

        // Cleanup after processing request
        transport.close();
      } catch (err) {
        console.error("Error handling MCP request:", err);
        throw new HTTPException(500, {
          message: "Error setting up MCP server",
        });
      }
    },
  );
}
