import "dotenv/config";

import { FastMCP } from "fastmcp";
import { FastMCPAuthSession } from "./types.js";
import { MCP_TOOL_SCOPES, registerTools } from "./tools.js";
import { authenticate } from "./auth0.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN as string;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE as string;

export const server = new FastMCP<FastMCPAuthSession>({
  name: "FastMCP Auth0 Example Server - CTE",
  version: "1.0.0",

  /**
   * Authentication function that validates Auth0 JWT tokens.
   * Called during session creation for each incoming connection.
   *
   * When a client connects via HTTP transport, FastMCP calls this function
   * to authenticate the request before creating a new session.
   */
  authenticate,

  /**
   * OAuth discovery configuration - enables RFC-compliant OAuth endpoints
   * Only active when server runs with HTTP-based transports (httpStream/SSE)
   * Ignored completely for stdio transport
   */
  oauth: {
    enabled: true,

    /**
     * Exposes /.well-known/oauth-protected-resource endpoint and tells OAuth clients:
     * - What resource they're accessing (audience)
     * - Which authorization servers can issue valid tokens
     * - Where to find public keys for token verification
     */
    protectedResource: {
      /**
       * API identifier (audience claim in JWT tokens)
       * Must match the 'aud' claim in incoming Auth0 access tokens
       */
      resource: AUTH0_AUDIENCE,

      /**
       * Array of trusted authorization servers that can issue tokens
       * for this protected resource. In this case, just our Auth0 tenant.
       */
      authorizationServers: [`https://${AUTH0_DOMAIN}/`],

      /**
       * JWKS endpoint for token verification
       * Points to Auth0's public keys used to verify JWT signatures
       * Used by clients to validate tokens before sending requests
       */
      jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,

      /**
       * Supported OAuth scopes for requesting access to this resource.
       */
      scopesSupported: ["openid", "profile", "email", ...MCP_TOOL_SCOPES],
    },

    /**
     * Exposes /.well-known/oauth-authorization-server endpoint for backwards compatibility.
     * This enables backward compatibility for clients that expect authorization server metadata
     * to be available directly from this MCP server
     */
    authorizationServer: {
      issuer: `https://${AUTH0_DOMAIN}/`,
      authorizationEndpoint: `https://${AUTH0_DOMAIN}/authorize`,
      tokenEndpoint: `https://${AUTH0_DOMAIN}/oauth/token`,
      jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
      responseTypesSupported: ["code"],
      scopesSupported: ["openid", "profile", "email", ...MCP_TOOL_SCOPES],
    },
  },
});

const start = async () => {
  /**
   * Registers all tools to the FastMCP server.
   */
  registerTools(server);

  try {
    /**
     * Starts the server.
     */
    await server.start({
      transportType: "httpStream",
      httpStream: {
        port: PORT,
        endpoint: "/mcp",
        stateless: true,
      },
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
