import { Auth0Client } from '@auth0/nextjs-auth0/server';

// Create an Auth0 Client.
export const auth0 = new Auth0Client({
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  appBaseUrl: process.env.APP_BASE_URL,
  secret: process.env.AUTH0_SECRET,
  authorizationParameters: {
    // In v4, the AUTH0_SCOPE and AUTH0_AUDIENCE environment variables are no longer automatically picked up by the SDK.
    // Instead, we need to provide the values explicitly.
    scope: process.env.AUTH0_SCOPE,
    audience: process.env.AUTH0_AUDIENCE,
  },

  // Mounts /auth/connect endpoint
  enableConnectAccountEndpoint: true
});

// Get the Access token from Auth0 session
export const getAccessToken = async () => {
  const tokenResult = await auth0.getAccessToken();

  if(!tokenResult || !tokenResult.token) {
    throw new Error("No access token found in Auth0 session");
  }
  
  return tokenResult.token;
};