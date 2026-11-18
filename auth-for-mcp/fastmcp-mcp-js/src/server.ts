import { createFastMcpAuth } from "@auth0/ai-fastmcp";
import type { Auth0Session } from "@auth0/ai-fastmcp";
import { FastMCP } from "fastmcp";
import { MCP_TOOL_SCOPES, registerTools } from "./tools.js";

/**
 * Creates the FastMCP server. `createFastMcpAuth` does all the Auth0 work: it verifies the
 * access token on every request, answers a missing or invalid token with a `WWW-Authenticate`
 * challenge, and serves the protected resource metadata (RFC 9728).
 *
 * It reads `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` from the environment. The audience is the public
 * MCP URL (for example http://localhost:3001/mcp), and the authorization server defaults to
 * https://<AUTH0_DOMAIN>/. `auth.endpoint` is the path of the audience, so the route is set in
 * one place.
 */
export function createServer() {
  const auth = createFastMcpAuth({
    metadata: {
      resourceName: "FastMCP Auth0 Example Server",
      scopesSupported: ["openid", ...MCP_TOOL_SCOPES],
    },
  });

  const server = new FastMCP<Auth0Session>({
    name: "FastMCP Auth0 Example Server",
    version: "1.0.0",
    ...auth,
  });
  registerTools(server);

  return { server, endpoint: auth.endpoint };
}
