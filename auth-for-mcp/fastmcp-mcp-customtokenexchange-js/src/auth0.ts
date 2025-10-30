import type { IncomingMessage } from "http";
import { ApiClient, VerifyAccessTokenError, InvalidRequestError, getToken } from "@auth0/auth0-api-js";
import {
  InsufficientScopeError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { FastMCPAuthSession } from "./types.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? `http://localhost:${PORT}`;
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN as string;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE as string;

const MCP_AUTH0_CLIENT_ID = process.env.MCP_AUTH0_CLIENT_ID as string;
const MCP_AUTH0_CLIENT_SECRET = process.env.MCP_AUTH0_CLIENT_SECRET as string;
const MCP_AUTH0_SUBJECT_TOKEN_TYPE = process.env.MCP_AUTH0_SUBJECT_TOKEN_TYPE as string;
const MCP_AUTH0_EXCHANGE_SCOPE = process.env.MCP_AUTH0_EXCHANGE_SCOPE as string;
const API_AUTH0_AUDIENCE = process.env.API_AUTH0_AUDIENCE as string;

// Resource server's OAuth 2.0 client for token verification and exchange
// Configured with the MCP resource server's audience
const apiClient = new ApiClient({
  domain: AUTH0_DOMAIN,
  audience: AUTH0_AUDIENCE,
  clientId: MCP_AUTH0_CLIENT_ID,
  clientSecret: MCP_AUTH0_CLIENT_SECRET,
});

export async function exchangeCustomToken(subjectToken: string) {
    // Use the resource server's OAuth 2.0 client to exchange tokens
    // The 'audience' parameter specifies the target audience for the exchanged token
    return await apiClient.getTokenByExchangeProfile(subjectToken, {
      subjectTokenType: MCP_AUTH0_SUBJECT_TOKEN_TYPE,
      audience: API_AUTH0_AUDIENCE, // Target audience for the exchanged token
      ...(MCP_AUTH0_EXCHANGE_SCOPE && { scope: MCP_AUTH0_EXCHANGE_SCOPE }),
    });
}

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

    const token = {
      token: accessToken,
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
