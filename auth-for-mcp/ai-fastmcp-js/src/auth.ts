import { MemoryIndexedTokenStore } from "@auth0/ai-mcp";
import { createFastMcpAuth } from "@auth0/ai-fastmcp";
import type { FastMcpAuth } from "@auth0/ai-fastmcp";
import type { AppConfig } from "./config.js";
import { SCOPE_CANCEL_ORDER } from "./scopes.js";

/**
 * All the Auth0 wiring of the example: the two FastMCP options that authenticate every request.
 *
 * The tenant settings are not passed here. `createFastMcpAuth` reads them from the environment:
 * `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` (the public URL of the MCP endpoint, which is also the
 * identifier of the API that represents this server), and `AUTH0_CLIENT_ID` and
 * `AUTH0_CLIENT_SECRET` of the application that performs the token exchanges.
 *
 * `resource` and `authorizationServers` default to the audience and to `https://<domain>/`, so
 * they are not repeated here. `endpoint` defaults to the path of the audience, and
 * `auth.endpoint` hands it to `server.start`. The token store keeps exchanged tokens, so a repeat
 * call by the same caller does not go back to the tenant.
 *
 * `cancel_order` checks its own scope, and a scope that only one tool checks is not published
 * on its own. `metadata.scopesSupported` lists it, so an OAuth client asks for it when it signs in.
 */
export function createAuth(config: AppConfig): FastMcpAuth {
  return createFastMcpAuth({
    tokenStore: new MemoryIndexedTokenStore(),
    ...(config.requiredScopes.length > 0 && { requiredScopes: config.requiredScopes }),
    metadata: {
      resourceName: "Orders example",
      scopesSupported: [...new Set([...config.requiredScopes, SCOPE_CANCEL_ORDER])],
    },
  });
}
