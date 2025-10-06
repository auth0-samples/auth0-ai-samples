import dotenv from 'dotenv';
dotenv.config();

const str = (v, fallback = '') => {
    const s = (v ?? '').toString().trim();
    return s === '' ? fallback : s;
};
const int = (v, fallback) => {
    const n = parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) ? n : fallback;
};

// Static configuration with sensible defaults
export const MCP_PORT = int(process.env.MCP_PORT, 8080);
export const MCP_BASE_URL = str(process.env.MCP_BASE_URL, `http://localhost:${MCP_PORT}`);
export const MCP_AUTH0_SUBJECT_TOKEN_TYPE = str(process.env.MCP_AUTH0_SUBJECT_TOKEN_TYPE, 'urn:taskvantage:mcp');
export const MCP_AUTH0_EXCHANGE_SCOPE = str(process.env.MCP_AUTH0_EXCHANGE_SCOPE, 'openid offline_access tasks:read tasks:write projects:read projects:write');

// API service configuration
export const API_PORT = int(process.env.API_PORT, 8787);
export const API_BASE_URL = str(process.env.API_BASE_URL, `http://localhost:${API_PORT}`);
export const API_AUTH0_AUDIENCE = str(process.env.API_AUTH0_AUDIENCE);

// Auth0 configuration (required for authentication)
export const AUTH0_DOMAIN = str(process.env.AUTH0_DOMAIN);
export const MCP_AUTH0_AUDIENCE = str(process.env.MCP_AUTH0_AUDIENCE);
export const MCP_AUTH0_CLIENT_ID = str(process.env.MCP_AUTH0_CLIENT_ID);
export const MCP_AUTH0_CLIENT_SECRET = str(process.env.MCP_AUTH0_CLIENT_SECRET);

export const AUTH_ENABLED = Boolean(AUTH0_DOMAIN && MCP_AUTH0_AUDIENCE);
export const CTE_ENABLED =
    Boolean(AUTH_ENABLED && MCP_AUTH0_CLIENT_ID && MCP_AUTH0_CLIENT_SECRET && MCP_AUTH0_SUBJECT_TOKEN_TYPE);
