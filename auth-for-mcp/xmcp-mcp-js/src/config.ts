// Auth0 configuration
export const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE as string;
export const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN as string;

// Server configuration
export const PORT = parseInt(process.env.PORT ?? "3001", 10);
export const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL ?? `http://localhost:${PORT}`;
