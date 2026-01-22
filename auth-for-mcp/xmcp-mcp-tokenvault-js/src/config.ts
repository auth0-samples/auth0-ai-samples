// Auth0 configuration (using official xmcp plugin environment variables)
export const DOMAIN = process.env.DOMAIN!;
export const AUDIENCE = process.env.AUDIENCE!;
export const CLIENT_ID = process.env.CLIENT_ID!;
export const CLIENT_SECRET = process.env.CLIENT_SECRET!;

// Server configuration
export const PORT = parseInt(process.env.PORT ?? "3001", 10);
export const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
