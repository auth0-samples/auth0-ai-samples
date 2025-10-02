import { Auth0Client } from '@auth0/nextjs-auth0/server';

export const auth0 = new Auth0Client({
  authorizationParameters: {
    scope: process.env.AUTH0_SCOPE,
    audience: process.env.AUTH0_AUDIENCE,
  },
});

// Get the Access token from Auth0 session
export const getAccessToken = async () => {
  const tokenResult = await auth0.getAccessToken();

  if(!tokenResult || !tokenResult.token) {
    throw new Error("No access token found in Auth0 session");
  }
  
  return tokenResult.token;
};