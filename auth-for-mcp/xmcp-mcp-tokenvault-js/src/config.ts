// Auth0 configuration
export const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE as string;
export const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN as string;
export const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID as string;
export const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET as string;
export const AUTH0_CLIENT_ASSERTION_SIGNING_ALG = process.env.AUTH0_CLIENT_ASSERTION_SIGNING_ALG as string;
export const AUTH0_CLIENT_ASSERTION_SIGNING_KEY = process.env.AUTH0_CLIENT_ASSERTION_SIGNING_KEY as string;


if (!AUTH0_CLIENT_ID) {
    throw new Error("AUTH0_CLIENT_ID is required for the MCP Server to leverage associated application see https://auth0.com/docs/secure/tokens/token-vault/configure-access-token-exchange-with-token-vault#create-custom-api-client")
}

if (!AUTH0_CLIENT_ASSERTION_SIGNING_KEY && !AUTH0_CLIENT_SECRET) {
   throw new Error("Either AUTH0_CLIENT_ASSERTION_SIGNING_KEY or AUTH0_CLIENT_SECRET is required for the MCP Server to leverage associated application see https://auth0.com/docs/secure/tokens/token-vault/configure-access-token-exchange-with-token-vault#create-custom-api-client")
}

// Server configuration
export const PORT = parseInt(process.env.PORT ?? "3001", 10);
export const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL ?? `http://localhost:${PORT}`;
