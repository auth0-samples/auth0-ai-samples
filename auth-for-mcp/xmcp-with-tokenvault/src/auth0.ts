import {
  ApiClient,
  getToken,
  ProtectedResourceMetadataBuilder,
  VerifyAccessTokenError,
} from "@auth0/auth0-api-js";
import {
  InsufficientScopeError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { Middleware, ToolExtraArguments } from "xmcp";
import { headers } from "xmcp/headers";
import {
  AUTH0_AUDIENCE,
  AUTH0_DOMAIN,
  MCP_SERVER_URL,
  AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET,
  AUTH0_CLIENT_ASSERTION_SIGNING_ALG,
  AUTH0_CLIENT_ASSERTION_SIGNING_KEY,
} from "./config";
import { Auth } from "./types";

const auth0Mcp = createAuth0Mcp();
export const apiClient = new ApiClient({
  domain: AUTH0_DOMAIN,
  audience: AUTH0_AUDIENCE,
  clientId: AUTH0_CLIENT_ID,
  clientSecret: AUTH0_CLIENT_SECRET,
  clientAssertionSigningAlg: AUTH0_CLIENT_ASSERTION_SIGNING_ALG,
  clientAssertionSigningKey: AUTH0_CLIENT_ASSERTION_SIGNING_KEY
});

export default auth0Mcp;

export function createAuth0Mcp() {
  const verify = createVerifier();
  const requireScopes = createScopeValidator(verify);
  const protectedResourceMetadataMiddleware = createProtectedResourceMetadataMiddleware();
  const authMiddleware = createAuthMiddleware(verify);

  return {
    /**
     * Wraps an MCP tool handler to enforce required OAuth scopes.
     *
     * @example
     * ```typescript
     * // Require specific scopes
     * export default auth0Mcp.requireScopes(["tool:greet"], async (params, { authInfo }) => {
     *   // Tool logic here
     * });
     *
     * // Authentication only (no scope validation)
     * export default auth0Mcp.requireScopes([], async (params, { authInfo }) => {
     *   // Tool logic here - just needs authenticated user
     * });
     */
    requireScopes,

    /**
     * A router that exposes OAuth metadata endpoints needed for MCP clients.
     */
    protectedResourceMetadataMiddleware: () => protectedResourceMetadataMiddleware,

    /**
     * Creates middleware for protecting MCP endpoints.
     * Validates Bearer tokens and populates req.auth with user information.
     */
    authMiddleware: () => authMiddleware,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Creates a JWT token verifier for Auth0-issued access tokens.
 *
 * This function returns a reusable `verify` function that validates JWT signatures,
 * token claims, and extracts user identity information for MCP integration using
 * the official @auth0/auth0-api-js library.
 */
function createVerifier() {
  return async function verify(token: string): Promise<Auth> {
    try {
      const decoded = await apiClient.verifyAccessToken({
        accessToken: token,
      });

      if (!isNonEmptyString(decoded.sub)) {
        throw new InvalidTokenError(
          "Token is missing required subject (sub) claim"
        );
      }

      let clientId: string | null = null;
      if (isNonEmptyString(decoded.client_id)) {
        clientId = decoded.client_id;
      } else if (isNonEmptyString(decoded.azp)) {
        clientId = decoded.azp;
      }

      if (!clientId) {
        throw new InvalidTokenError(
          "Token is missing required client identification (client_id or azp claim)."
        );
      }

      return {
        token,
        clientId,
        scopes:
          typeof decoded.scope === "string"
            ? decoded.scope.split(" ").filter(Boolean)
            : [],
        ...(decoded.exp && { expiresAt: decoded.exp }),
        extra: {
          sub: decoded.sub,
          ...(isNonEmptyString(decoded.client_id) && {
            client_id: decoded.client_id,
          }),
          ...(isNonEmptyString(decoded.azp) && { azp: decoded.azp }),
          ...(isNonEmptyString(decoded.name) && { name: decoded.name }),
          ...(isNonEmptyString(decoded.email) && { email: decoded.email }),
        },
      };
    } catch (error) {
      if (error instanceof VerifyAccessTokenError) {
        throw new InvalidTokenError(error.message);
      }
      throw error;
    }
  };
}

/**
 * Check if user has all required scopes.
 */
function hasAllScopes(
  requiredScopes: readonly string[],
  userScopes: readonly string[]
): boolean {
  return requiredScopes.every((scope) => userScopes.includes(scope));
}

/**
 * Wraps an MCP tool handler to enforce required OAuth scopes.
 *
 * This is a higher-order function that adds scope-based authorization to MCP tools.
 * It validates that the authenticated user's JWT token contains all required scopes
 * before allowing access to the wrapped tool.
 */
function createScopeValidator(verifyToken: (token: string) => Promise<Auth>) {
  return function requireScopes<TParams, TReturn>(
    requiredScopes: readonly string[],
    toolFunction: (
      params: TParams,
      context: { authInfo: Auth }
    ) => Promise<TReturn>
  ): (params: TParams, context: ToolExtraArguments) => Promise<TReturn> {
    return async (params: TParams, _context) => {
      const token = getToken(headers());
      const decoded = await verifyToken(token);

      const userScopes = decoded.scopes;
      if (!hasAllScopes(requiredScopes, userScopes)) {
        const missing = requiredScopes.filter(
          (scope) => !userScopes.includes(scope)
        );
        throw new InsufficientScopeError(
          `Missing required scopes: ${missing.join(", ")}.`
        );
      }

      return toolFunction(params, { authInfo: decoded });
    };
  };
}

/**
 * Returns a middleware that protects MCP endpoint
 */
function createAuthMiddleware(verifier: (token: string) => Promise<Auth>) {
  return requireBearerAuth({
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(
      new URL(MCP_SERVER_URL)
    ),
    verifier: { verifyAccessToken: verifier },
  });
}

/**
 * Returns a router that exposes the OAuth protected resource metadata endpoint.
 */
function createProtectedResourceMetadataMiddleware() {

  const prmMiddleware: Middleware = (req, res, next) => {
    
    const prmPath = getOAuthProtectedResourceMetadataUrl(new URL(MCP_SERVER_URL));
    const reqUrl = (new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`)).toString();

    if (reqUrl !== prmPath) {
      return next();
    }
    const metadata = new ProtectedResourceMetadataBuilder(MCP_SERVER_URL, [
      `https://${AUTH0_DOMAIN}/`,
    ])
      .withJwksUri(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
      .withScopesSupported([
        // OIDC scopes
        "openid",
        "profile",
        "email",

        // tool scopes
        "tool:greet",
        "tool:whoami",
        "tool:calendar_summary"
      ])
      .build();
    res.json(metadata.toJSON());
  };

  return prmMiddleware;
}
