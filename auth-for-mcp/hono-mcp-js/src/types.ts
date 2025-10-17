/**
 * Contains TypeScript type definitions specific to this
 * Hono implementation, including Cloudflare Workers environment configuration.
 */

import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  McpServer,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Context, MiddlewareHandler } from "hono";
import { ZodRawShape } from "zod";

/**
 * Extended authentication information for Auth0-authenticated users.
 *
 * This interface extends the standard MCP AuthInfo with Auth0-specific user identity
 * claims extracted from JWT access tokens. It provides comprehensive user context
 * for MCP tool handlers and middleware.
 *
 **/
export interface Auth extends AuthInfo {
  extra: {
    /** User identifier from Auth0. */
    sub: string;

    /** Standard OAuth 2.0 client_id claim, if available. */
    client_id?: string;

    /** Auth0-specific azp (authorized party) claim, if available. */
    azp?: string;

    /** User's full name, if available. */
    name?: string;

    /** User's email address, if available. */
    email?: string;
  };
}

/**
 * Cloudflare Workers environment interface - strict typing, no index signature.
 */
export interface Env {
  readonly AUTH0_DOMAIN: string;
  readonly AUTH0_AUDIENCE: string;
  readonly AUTH0_TENANT: string;
  readonly MCP_SERVER_URL?: string;
  readonly NODE_ENV?: string;
}

/**
 * Variables for Hono context - includes auth info set by middleware
 */
export interface Variables {
  auth: Auth;
  auth0Mcp: {
    resourceName: string;
    requireScopes: <T extends ZodRawShape>(
      requiredScopes: readonly string[],
      handler: (args: T, extra: { authInfo: Auth }) => Promise<CallToolResult>,
    ) => ToolCallback<T>;
    authMiddleware: () => MiddlewareHandler; // Hono middleware function
  };
  mcpServer: McpServer; // MCP server instance
  mcpTransport: StreamableHTTPServerTransport; // MCP transport instance
}

/**
 * App context that combines Hono's typed context with Auth0 authentication.
 * By providing Variables to Hono<{ Bindings; Variables }>, we get fully-typed c.get() calls.
 */
export type AppContext = Context<{ Bindings: Env; Variables: Variables }>;
