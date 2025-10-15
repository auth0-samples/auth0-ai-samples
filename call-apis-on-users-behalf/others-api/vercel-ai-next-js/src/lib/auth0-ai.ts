import { Auth0AI, getAccessTokenFromTokenVault } from '@auth0/ai-vercel';
import { getRefreshToken } from './auth0';

// Get the access token for a connection via Auth0
export const getAccessToken = async () => getAccessTokenFromTokenVault();

const auth0AI = new Auth0AI();

// Connection for Google services
export const withGoogleConnection = auth0AI.withTokenVault({
  authorizationParams: {
    access_type: "offline"
  },
  connection: 'google-oauth2',
  scopes: ['https://www.googleapis.com/auth/calendar.events'],
  refreshToken: getRefreshToken,
});