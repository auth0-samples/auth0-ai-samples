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
export const API_PORT = int(process.env.API_PORT, 8787);
export const API_BASE_URL = str(process.env.API_BASE_URL, `http://localhost:${API_PORT}`);
export const API_DEFAULT_ORG = str(process.env.API_DEFAULT_ORG, 'demo-org');

// Auth0 configuration (required for authentication)
export const AUTH0_DOMAIN = str(process.env.AUTH0_DOMAIN);
export const API_AUTH0_AUDIENCE = str(process.env.API_AUTH0_AUDIENCE);

// Treat auth as enabled only when all required pieces are present
export const AUTH_ENABLED = Boolean(AUTH0_DOMAIN && API_AUTH0_AUDIENCE);
