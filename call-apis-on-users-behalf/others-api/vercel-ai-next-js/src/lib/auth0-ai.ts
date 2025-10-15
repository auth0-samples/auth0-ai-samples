import { Auth0AI, getAccessTokenFromTokenVault } from '@auth0/ai-vercel';
import { getRefreshToken } from './auth0';

// Get the access token for a connection via Auth0
export const getAccessToken = async () => getAccessTokenFromTokenVault();

const auth0AI = new Auth0AI({
  auth0: {
    domain: process.env.AUTH0_DOMAIN!,
    clientId: process.env.CUSTOM_API_CLIENT_ID!, // Resource server client ID for token exchange
    clientSecret: process.env.CUSTOM_API_CLIENT_SECRET!, // Resource server client secret
  },
});

// Connection for Google services
export const withGoogleConnection = auth0AI.withTokenVault({
  connection: 'google-oauth2',
  scopes: ['https://www.googleapis.com/auth/calendar.events'],
  refreshToken: getRefreshToken,
});