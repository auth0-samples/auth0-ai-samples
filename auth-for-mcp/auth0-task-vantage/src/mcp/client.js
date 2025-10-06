import * as env from './env.js';
// Using standard errors instead of FastMCP UserError
import { exchangeCustomToken } from './auth.js';
import { createLogger } from '../utils/logger.js';

// NOTE: This is a temporary implementation of Custom Token Exchange (CTE).
// SDK support is in progress: https://github.com/auth0/auth0-auth-js/pull/75
// Once the SDK support is merged, this manual implementation can be replaced.

const log = createLogger('mcp-client');

// Helper to sanitize objects for logging (remove sensitive data)
function sanitizeForLogging(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const sanitized = { ...obj };

  // Remove common sensitive fields
  const sensitiveFields = ['token', 'authInfo', 'authorization', 'password', 'secret', 'key'];

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      delete sanitized[field];
    }
  }

  // Recursively sanitize nested objects
  for (const [key, value] of Object.entries(sanitized)) {
    if (value && typeof value === 'object') {
      sanitized[key] = sanitizeForLogging(value);
    }
  }

  return sanitized;
}

// conservative clock skew for token lifetimes
const SKEW_MS = 30_000;
// simple size cap to avoid unbounded growth
const MAX_CACHE_ENTRIES = 200;

// cache: Map<cacheKey, { accessToken: string, expiresAt: number }>
const tokenCache = new Map();

const makeKey = (subjectToken) =>
    `${env.MCP_AUTH0_AUDIENCE}::${env.MCP_AUTH0_SUBJECT_TOKEN_TYPE}::${subjectToken}`;

function evictIfNeeded() {
    if (tokenCache.size <= MAX_CACHE_ENTRIES) return;
    const oldestKey = tokenCache.keys().next().value;
    if (oldestKey) tokenCache.delete(oldestKey);
}

async function bearerForUpstream(subjectToken) {
    if (!subjectToken) return { token: null, scopes: null };
    if (!env.CTE_ENABLED) return { token: subjectToken, scopes: null };

    const key = makeKey(subjectToken);
    const now = Date.now();
    const cached = tokenCache.get(key);
    if (cached && cached.expiresAt - SKEW_MS > now) {
        log.log('TOKEN: cached');
        return { token: cached.accessToken, scopes: cached.scopes };
    }

    try {
        log.log('TOKEN: exchanging...');
        const res = await exchangeCustomToken(subjectToken);
        const ttlMs = (typeof res.expires_in === 'number' ? res.expires_in : 60) * 1000;
        
        // Extract scopes from the exchanged token
        let scopes = null;
        if (res.access_token) {
            try {
                const payload = JSON.parse(Buffer.from(res.access_token.split('.')[1], 'base64').toString());
                scopes = payload.scope;
            } catch (e) {
                // Ignore scope extraction errors
            }
        }
        
        const record = { accessToken: res.access_token, scopes, expiresAt: now + ttlMs };
        tokenCache.set(key, record);
        evictIfNeeded();
        log.log('TOKEN: cached');
        return { token: record.accessToken, scopes: record.scopes };
    } catch (e) {
        console.warn(`⚠️  CTE failed; using incoming token. ${e?.message || e}`);
        return { token: subjectToken, scopes: null }; // fail-open for demos
    }
}

export async function callApi(path, { method = 'GET', body, session, token } = {}) {
    const headers = { 'content-type': 'application/json' };
    // Use token directly if provided, otherwise try to get from session
    const sourceToken = token || session?.token;
    const { token: bearer, scopes } = await bearerForUpstream(sourceToken);
    if (bearer) headers.authorization = `Bearer ${bearer}`;

    // Sanitize body for logging - remove any token/auth fields
    const sanitizedBody = body ? sanitizeForLogging(body) : undefined;
    log.log(`API ${method} ${path}`, { auth: bearer ? `${bearer[0]}***` : 'none', body: sanitizedBody });
    
    const res = await fetch(`${env.API_BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        log.error(`API ${method} ${path} FAILED`, { status: res.status, error: text });
        throw new Error(`API ${method} ${path} failed ${res.status}: ${text}`);
    }
    
    const result = await res.json();
    
    // Add scopes to response metadata if available
    if (scopes) {
        return {
            ...result,
            _metadata: {
                ...result._metadata,
                exchangedScopes: scopes
            }
        };
    }
    
    return result;
}

// tiny helpers reused in tools
export const enc = encodeURIComponent;
export const qs = (o) =>
    new URLSearchParams(
        Object.entries(o || {}).flatMap(([k, v]) => (v == null || v === '' ? [] : [[k, String(v)]])),
    );

// optional helpers if you need cache control elsewhere
export function clearTokenCache() {
    tokenCache.clear();
}
export function cacheSize() {
    return tokenCache.size;
}
