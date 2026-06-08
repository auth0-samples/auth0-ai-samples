import { Auth0Client } from '@auth0/nextjs-auth0/server';

// Create an Auth0 Client.
export const auth0 = new Auth0Client({
  // Mounts /auth/connect endpoint
  enableConnectAccountEndpoint: true
});

// Get the refresh token from Auth0 session
export const getRefreshToken = async () => {
  const session = await auth0.getSession();
  return session?.tokenSet?.refreshToken;
};