import { createNodeMcpHandler } from "@auth0/ai-mcp/mcp-sdk";
import cors from "cors";
import express, { type Express } from "express";
import { MCP_TOOL_SCOPES, createMcpServer } from "./tools.js";

/**
 * Creates the Express app. One `createNodeMcpHandler` call does all the Auth0 work: it
 * verifies the access token on every request, answers a missing or invalid token with a
 * `WWW-Authenticate` challenge, and serves the protected resource metadata (RFC 9728).
 *
 * The handler reads `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` from the environment. The audience
 * is the public MCP URL (for example http://localhost:3001/mcp), and the authorization server
 * defaults to https://<AUTH0_DOMAIN>/.
 */
export function createExpressApp(): Express {
  const app = express();

  // The handler sends no CORS headers and reads the request body itself, so CORS comes first
  // and no body parser is mounted before the handler.
  app.use(
    cors({
      origin: "*", // Adjust as needed for production
      allowedHeaders: ["Authorization", "Content-Type", "Mcp-Session-Id", "Mcp-Protocol-Version"],
      exposedHeaders: ["WWW-Authenticate", "Mcp-Session-Id"],
    }),
  );

  const handler = createNodeMcpHandler({
    metadata: {
      resourceName: "Example Express MCP Server",
      scopesSupported: ["openid", ...MCP_TOOL_SCOPES],
    },
    onError: (error) =>
      console.error("request failed", error instanceof Error ? error.name : "unknown"),
    createServer: createMcpServer,
  });

  // Express routes by path, so mount the handler on the MCP path and on the metadata path
  // that the challenge advertises.
  app.all("/mcp", handler);
  app.get("/.well-known/oauth-protected-resource/mcp", handler);

  return app;
}
