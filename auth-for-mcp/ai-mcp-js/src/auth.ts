import type { IncomingMessage, ServerResponse } from "node:http";
import { MemoryIndexedTokenStore } from "@auth0/ai-mcp";
import { createNodeMcpHandler } from "@auth0/ai-mcp/mcp-sdk";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpServerConfig } from "./config.js";
import { TOOL_SCOPES } from "./scopes.js";

/**
 * Returns a Node request listener that authenticates every request with Auth0 and serves MCP
 * with the server `createServer` builds.
 *
 * The settings come from `config` and are passed inline, which is the simplest tier that fits
 * here: the example names its variables itself (the MCP URL is the audience), and it needs a
 * token store. A server whose variables are `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID`
 * and `AUTH0_CLIENT_SECRET` can leave all of them out and let the handler read the environment.
 *
 * `resource` and `authorizationServers` default to the audience (the public MCP URL) and to
 * https://<domain>/, so they are not repeated here.
 */
export function createAuthenticatedHandler(
  config: McpServerConfig,
  createServer: () => McpServer,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return createNodeMcpHandler({
    domain: config.domain,
    audience: config.serverUrl,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    // Reuses exchanged tokens for repeat calls by the same caller.
    tokenStore: new MemoryIndexedTokenStore(),
    requiredScopes: config.requiredScopes,
    // MCP clients ask for the scopes the server lists here. A client that finds none asks for
    // none, gets a token without the tool scopes, and every tool then refuses the call.
    metadata: { resourceName: "Store example", scopesSupported: [...TOOL_SCOPES] },
    onError: (error) =>
      console.error(
        "request failed",
        error instanceof Error ? error.name : "unknown",
      ),
    createServer,
  });
}
