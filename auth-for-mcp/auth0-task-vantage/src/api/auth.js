import { ApiClient } from '@auth0/auth0-api-js';
import * as env from './env.js';

let apiClient = null;

export function applyAuth(app) {
    if (env.AUTH_ENABLED) {
        // Initialize Auth0 API client
        apiClient = new ApiClient({
            domain: env.AUTH0_DOMAIN,
            audience: env.API_AUTH0_AUDIENCE,
        });

        // Apply auth middleware to all routes
        app.use('/*', authMiddleware);
    } else {
        console.warn('⚠️  Missing AUTH0_DOMAIN / API_AUTH0_AUDIENCE. Running with NO AUTH ❌');
    }
}

async function authMiddleware(context, next) {
    if (!env.AUTH_ENABLED) {
        return next();
    }

    // Extract access token from Authorization header
    const authHeader = context.req.header('authorization') || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    
    if (!accessToken) {
        console.log("No access token provided");
        return context.json({ error: "Unauthorized: Missing access token" }, 401, {
            'WWW-Authenticate': `Bearer resource="${env.API_AUTH0_AUDIENCE}"`
        });
    }

    try {
        console.log("Verifying access token...");
        const decodedAndVerifiedToken = await apiClient.verifyAccessToken({
            accessToken
        });

        console.log("Token verified successfully:", decodedAndVerifiedToken);
        
        // Store the decoded token in context for use by getAuth
        context.set('auth0Token', decodedAndVerifiedToken);
        
        return next();
    } catch (error) {
        console.log("Error verifying access token:", error);
        return context.json({ error: "Unauthorized: Invalid access token" }, 401, {
            'WWW-Authenticate': `Bearer resource="${env.API_AUTH0_AUDIENCE}"`
        });
    }
}

// Pull identity from middleware if present; otherwise fall back to demo defaults.
export function getAuth(context) {
    const token = context.get('auth0Token');
    
    // The token structure might be different - it could be the payload directly
    // or have a different structure than expected
    const user = token?.payload || token || {};
    
    const userId = typeof user.sub === 'string' && user.sub ? user.sub : 'anonymous';
    const orgId = (typeof user.org_id === 'string' && user.org_id) || env.API_DEFAULT_ORG;

    // The scope might be directly on the token payload, not nested in a user object
    const scopeValue = user.scope;
    
    const scopes = Array.isArray(scopeValue)
        ? scopeValue
        : typeof scopeValue === 'string'
            ? scopeValue.split(' ').filter(Boolean)
            : [];

    return { userId, orgId, scopes, user };
}

// Optional helper to enforce scopes on mutating routes (no-op by default)
export const requireScope = needed => c => {
    const { scopes } = getAuth(c);
    if (!scopes.includes(needed)) {
        return c.json({ error: `insufficient_scope, need: ${needed}` }, 403);
    }
};
