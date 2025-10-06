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
export const WEBAPP_PORT = int(process.env.WEBAPP_PORT, 3001);
export const WEBAPP_BASE_URL = str(process.env.WEBAPP_BASE_URL, `http://localhost:${WEBAPP_PORT}`);

// API service configuration
export const API_BASE_URL = str(process.env.API_BASE_URL);
export const API_AUTH0_AUDIENCE = str(process.env.API_AUTH0_AUDIENCE);

// Auth0 configuration (required for authentication)
export const AUTH0_DOMAIN = str(process.env.AUTH0_DOMAIN);
export const WEBAPP_AUTH0_CLIENT_ID = str(process.env.WEBAPP_AUTH0_CLIENT_ID);
export const WEBAPP_AUTH0_CLIENT_SECRET = str(process.env.WEBAPP_AUTH0_CLIENT_SECRET);
export const WEBAPP_SESSION_SECRET = str(process.env.WEBAPP_SESSION_SECRET);

export const AUTH_ENABLED = !(AUTH0_DOMAIN &&
  WEBAPP_AUTH0_CLIENT_ID &&
  WEBAPP_AUTH0_CLIENT_SECRET &&
  WEBAPP_BASE_URL &&
  WEBAPP_SESSION_SECRET)
