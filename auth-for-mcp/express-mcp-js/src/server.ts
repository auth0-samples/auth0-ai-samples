import { allowedMethods } from "@modelcontextprotocol/sdk/server/auth/middleware/allowedMethods.js";
import cors from "cors";
import express, { type Application } from "express";
import { auth0Mcp } from "./auth0.js";
import { requireAuth, withMcpServer } from "./utils.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const MCP_SERVER_RESOURCE_NAME = "Example Express MCP Server";
const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? `http://localhost:${PORT}`;
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN as string;
const AUDIENCE = process.env.AUTH0_AUDIENCE ?? MCP_SERVER_URL;

// Validate required environment variables
if (!AUTH0_DOMAIN) {
  throw new Error("AUTH0_DOMAIN environment variable is required");
}

/**
 * Create Express app with CORS, Auth0, and MCP handling.
 */
export async function createExpressApp(): Promise<Application> {
  const app = express();

  // Enable CORS
  app.use(
    cors({
      origin: "*", // Adjust as needed for production
      exposedHeaders: ["Mcp-Session-Id"],
      allowedHeaders: ["Content-Type", "mcp-session-id"],
    })
  );

  app.use(express.json());

  app.use(
    auth0Mcp({
      resourceName: MCP_SERVER_RESOURCE_NAME,
      resourceServerUrl: new URL(MCP_SERVER_URL),
      domain: AUTH0_DOMAIN,
      audience: AUDIENCE,
    })
  );

  app.post("/mcp", requireAuth, withMcpServer, async (req, res) => {
    try {
      await req.mcpTransport?.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("Error handling MCP request:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  app.use("/mcp", allowedMethods(["POST"]));

  return app;
}
