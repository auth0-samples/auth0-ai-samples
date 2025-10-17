import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

export interface Auth0McpOptions {
  /**
   * The base URL of this MCP server, used as the resource identifier
   * and for generating OAuth Protected Resource Metadata URLs.
   */
  resourceServerUrl: URL;

  /**
   * The full domain of the Auth0 tenant (e.g., "tenant.us.auth0.com").
   * Used for OIDC discovery and token validation.
   */
  domain: string;

  /**
   * Auth0 API identifier for token validation.
   * This should match your Auth0 API identifier or client ID.
   * Required for @auth0/auth0-api-js integration.
   */
  audience: string;

  /** Human-readable name for this MCP server, exposed in resource metadata. */
  resourceName: string;
}

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
