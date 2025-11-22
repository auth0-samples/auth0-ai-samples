import type { IncomingMessage } from "http";
import { ApiClient, VerifyAccessTokenError, InvalidRequestError, getToken } from "@auth0/auth0-api-js";
import {
  InsufficientScopeError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { FastMCPAuthSession } from "./types.js";
import { FGA_AUTHORIZATION_ENABLED, getTools } from "./openfga.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? `http://localhost:${PORT}`;
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN as string;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE as string;

const apiClient = new ApiClient({
  domain: AUTH0_DOMAIN,
  audience: AUTH0_AUDIENCE,
});

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export const authenticate = async (
  request: IncomingMessage
): Promise<FastMCPAuthSession> => {
  
  try {
    const accessToken = getToken(request.headers);
    const decoded = await apiClient.verifyAccessToken({
      accessToken,
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

    // Load available tools based on FGA authorization settings
    // Note that the authenticate method is called twwice per request, so the FGA Call will happen
    // twice per request, which is not ideal for performance. Caching could be implemented if needed.
    
    let availableTools: string[];
    if (FGA_AUTHORIZATION_ENABLED) {
      // Load tools from OpenFGA based on user's permissions
      availableTools = await getTools(decoded.sub);
      console.log(`[Auth] Loaded ${availableTools.length} tools from OpenFGA for user ${decoded.sub}`);
    } else {
      // Use hardcoded list of all available tools
      availableTools = ["greet", "whoami", "get_datetime", "get_documents"];
      console.log(`[Auth] Using hardcoded tool list (FGA disabled)`);
    }

    const token = {
      token: accessToken,
      clientId,
      scopes:
        typeof decoded.scope === "string"
          ? decoded.scope.split(" ").filter(Boolean)
          : [],
      ...(decoded.exp && { expiresAt: decoded.exp }),
      availableTools,
      extra: {
        sub: decoded.sub,
        ...(isNonEmptyString(decoded.client_id) && {
          client_id: decoded.client_id,
        }),
        ...(isNonEmptyString(decoded.azp) && { azp: decoded.azp }),
        ...(isNonEmptyString(decoded.name) && { name: decoded.name }),
        ...(isNonEmptyString(decoded.email) && { email: decoded.email }),
      },
    } satisfies FastMCPAuthSession;

    return token;
  } catch (error) {
    console.error(error);
    if (
      error instanceof InvalidRequestError ||
      error instanceof VerifyAccessTokenError ||
      error instanceof InvalidTokenError
    ) {
      /**
       * WWW-Authenticate header is used for 401 responses as per spec.
       */
      const wwwAuthValue = `Bearer error="invalid_token", error_description="${
        error.message
      }", resource_metadata="${getOAuthProtectedResourceMetadataUrl(
        new URL(MCP_SERVER_URL)
      )}"`;
      throw new Response(null, {
        status: 401,
        statusText: "Unauthorized",
        headers: {
          "WWW-Authenticate": wwwAuthValue,
        },
      });
    } else if (error instanceof InsufficientScopeError) {
      throw new Response(null, {
        status: 403,
        statusText: "Forbidden",
      });
    } else {
      throw new Response(null, {
        status: 500,
        statusText: "Internal Server Error",
      });
    }
  }
};
