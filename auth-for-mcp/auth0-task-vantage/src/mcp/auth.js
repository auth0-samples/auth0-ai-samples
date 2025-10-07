import * as env from './env.js';
import { ApiClient, VerifyAccessTokenError } from "@auth0/auth0-api-js";
import {
  InsufficientScopeError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { createLogger } from '../utils/logger.js';

const log = createLogger('mcp-auth');

// See https://auth0.com/docs/authenticate/custom-token-exchange#call-token-exchange
export async function exchangeCustomToken(subjectToken) {
    if (!env.CTE_ENABLED) throw new Error('cte not configured');

    const form = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        audience: env.API_AUTH0_AUDIENCE,
        subject_token_type: env.MCP_AUTH0_SUBJECT_TOKEN_TYPE,
        subject_token: subjectToken,
        client_id: env.MCP_AUTH0_CLIENT_ID,
        client_secret: env.MCP_AUTH0_CLIENT_SECRET,
    });
    if (env.MCP_AUTH0_EXCHANGE_SCOPE) form.set('scope', env.MCP_AUTH0_EXCHANGE_SCOPE);

    const res = await fetch(`https://${env.AUTH0_DOMAIN}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
    });

    if (!res.ok) {
        let msg = `${res.status}`;
        try {
            const j = await res.json();
            msg = `${j.error || 'error'}: ${j.error_description || ''}`.trim();
        } catch {
            msg = `${msg} ${await res.text().catch(() => '')}`.trim();
        }
        throw new Error(msg);
    }

    const json = await res.json();
    if (!json.access_token) throw new Error('no access_token in response');
    return json; // full token set
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

export const createMcpAuthFunction = (auth0Domain, auth0Audience) => {
  const apiClient = new ApiClient({
    domain: auth0Domain,
    audience: auth0Audience,
  });

  return async (request, bearer) => {
    if (!bearer) {
      log.error('MCP Auth failed: Missing bearer token');
      throw new InvalidTokenError("Missing authorization token");
    }

    // Debug token format
    log.log('Token received, length:', bearer.length);
    log.log('Token format check - parts:', bearer.split('.').length, 'expected: 3 for JWT');

    try {
      log.log('Attempting token verification with Auth0...');
      const decoded = await apiClient.verifyAccessToken({
        accessToken: bearer,
      });

      log.log('Token verification successful, decoded claims:', {
        sub: decoded.sub,
        client_id: decoded.client_id,
        azp: decoded.azp,
        aud: decoded.aud,
        scope: decoded.scope,
        exp: decoded.exp
      });

      if (!isNonEmptyString(decoded.sub)) {
        log.error('MCP Auth failed: Token missing required subject (sub) claim');
        throw new InvalidTokenError("Token is missing required subject (sub) claim");
      }

      let clientId = null;
      if (isNonEmptyString(decoded.client_id)) {
        clientId = decoded.client_id;
      } else if (isNonEmptyString(decoded.azp)) {
        clientId = decoded.azp;
      }

      if (!clientId) {
        log.error('MCP Auth failed: Token missing required client identification (client_id or azp claim)');
        throw new InvalidTokenError("Token is missing required client identification (client_id or azp claim)");
      }

      const session = {
        token: bearer,
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

      log.log('Session created successfully for user:', decoded.sub);
      return session;
    } catch (error) {
      if (error instanceof VerifyAccessTokenError) {
        log.error('MCP Auth failed: Token verification error:', error.message);
        log.error('VerifyAccessTokenError details:', error);
        throw new InvalidTokenError(`Token verification failed: ${error.message}`);
      } else if (error instanceof InvalidTokenError) {
        // Re-throw InvalidTokenError as-is (already logged above)
        throw error;
      } else {
        log.error('MCP Auth failed: Unexpected error:', error.message);
        log.error('Full error object:', error);
        throw new InvalidTokenError("Authentication failed due to internal error");
      }
    }
  };
};
