import { ApiClient, VerifyAccessTokenError } from "@auth0/auth0-api-js";
import { discoverAuthorizationServerMetadata } from "@modelcontextprotocol/sdk/client/auth.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import {
  McpServer,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import { ZodRawShape } from "zod";
import { MCP_TOOL_SCOPES } from "./tools.js";
import { Auth, Auth0McpOptions } from "./types.js";

declare module "express-serve-static-core" {
  interface Request {
    auth0Mcp: ReturnType<typeof createAuth0Mcp>;
    mcpTransport?: StreamableHTTPServerTransport;
    mcpServer?: McpServer;
  }
}

export function auth0Mcp(options: Auth0McpOptions) {
  //@ts-expect-error TypeScript doesnt like this
  const router = new express.Router();

  router.use(async (req: Request, res: Response, next: NextFunction) => {
    req.auth0Mcp = createAuth0Mcp({
      resourceName: options.resourceName,
      resourceServerUrl: options.resourceServerUrl,
      domain: options.domain,
      audience: options.audience,
    });
    next();
  });

  // Add metadata routes
  router.use(async (req: Request, res: Response, next: NextFunction) => {
    const metadataRouter = await req.auth0Mcp.authMetadataRouter();
    return metadataRouter(req, res, next);
  });

  return router;
}

export function createAuth0Mcp(opts: Auth0McpOptions) {
  const verify = createVerifier(opts);
  const requireScopes = createScopeValidator();

  const authMetadataRouter = createAuthMetadataRouter(opts);
  const authMiddleware = createAuthMiddleware(opts, verify);

  return {
    /**
     * Human-readable name for the protected resource (MCP server).
     */
    resourceName: opts.resourceName,

    /**
     * Creates an Express router that exposes OAuth metadata endpoints needed for MCP clients.
     */
    authMetadataRouter: () => authMetadataRouter,

    /**
     * Creates Express middleware for protecting MCP endpoints.
     * Validates Bearer tokens and populates req.auth with user information.
     */
    authMiddleware: () => authMiddleware,

    /**
     * Wraps an MCP tool handler to enforce required OAuth scopes.
     */
    requireScopes,
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
function createVerifier(opts: Auth0McpOptions) {
  const apiClient = new ApiClient({
    domain: opts.domain,
    audience: opts.audience,
  });
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
 * Returns a router that includes MCP authorization metadata endpoints.
 */
async function createAuthMetadataRouter(opts: Auth0McpOptions) {
  const oauthMetadata = await discoverAuthorizationServerMetadata(
    new URL(`https://${opts.domain}`)
  );

  if (!oauthMetadata) {
    throw new Error(`Failed to fetch OAuth metadata from ${opts.domain}`);
  }

  return mcpAuthMetadataRouter({
    oauthMetadata,
    resourceServerUrl: opts.resourceServerUrl,
    resourceName: opts.resourceName,
    scopesSupported: ["openid", ...MCP_TOOL_SCOPES],
  });
}

/**
 * Returns an Express middleware that protects MCP endpoints.
 */
function createAuthMiddleware(
  opts: Auth0McpOptions,
  verifier: (token: string) => Promise<Auth>
) {
  return requireBearerAuth({
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(
      opts.resourceServerUrl
    ),
    verifier: { verifyAccessToken: verifier },
  });
}

/**
 * Wraps an MCP tool handler to enforce required OAuth scopes.
 *
 * This is a higher-order function that adds scope-based authorization to MCP tools.
 * It validates that the authenticated user's JWT token contains all required scopes
 * before allowing access to the wrapped tool.
 */
function createScopeValidator() {
  /**
   * Wraps a tool handler with scope validation.
   * This function ensures that the tool can only be executed if the user has the required OAuth scopes.
   */
  return function requireScopes<T extends ZodRawShape>(
    requiredScopes: readonly string[],
    handler: (args: T, extra: { authInfo: Auth }) => Promise<CallToolResult>
  ): ToolCallback<T> {
    return (async (args, extra) => {
      // To support both context-only and payload+context handlers
      let context = extra;
      if (!extra) {
        context = args as Parameters<ToolCallback<T>>[1];
      }

      if (!context.authInfo) {
        throw new Error(
          "Authentication information is required to execute this tool."
        );
      }
      const userScopes = context.authInfo.scopes;
      const hasScopes = requiredScopes.every((scope) =>
        userScopes.includes(scope)
      );

      if (!hasScopes) {
        throw new Error(
          `Missing required scopes: ${requiredScopes.join(", ")}`
        );
      }

      return handler(args as T, { authInfo: context.authInfo as Auth });
    }) as ToolCallback<T>;
  };
}
