import { google } from "googleapis";

/**
 * Create Google OAuth2 client with access token.
 *
 * This is a helper function that creates a Google OAuth2 client
 * and sets the access token for Google which we obtain via Token Vault.
 */
export function createGoogleAuthClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken,
  });
  return oauth2Client;
}
