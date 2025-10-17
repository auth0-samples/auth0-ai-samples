import type { Request, Response, NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction
) {
  const authMiddleware = request.auth0Mcp.authMiddleware();
  return authMiddleware(request, response, next);
}

export async function withMcpServer(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { resourceName, requireScopes } = req.auth0Mcp;

    // In stateless mode, create a new instance of transport and server for each request
    // to ensure complete isolation. A single instance would cause request ID collisions
    // when multiple clients connect concurrently.
    const mcpServer = new McpServer({
      name: resourceName,
      version: "1.0.0",
    });

    // Register tools
    registerTools(mcpServer, requireScopes);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await mcpServer.connect(transport);

    req.mcpServer = mcpServer;
    req.mcpTransport = transport;

    res.on("close", () => {
      transport.close();
    });
    next();
  } catch (err) {
    console.error("Error handling MCP request:", err);
    next(err);
  }
}
