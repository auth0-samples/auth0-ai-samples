import { google } from "googleapis";
import { auth0 } from "./auth0";

export async function getGoogleAuth() {
  // Get access token for Google social connection.
  const { token } = await auth0.getAccessTokenForConnection({
    connection: "google-oauth2",
  });

  // Create Google OAuth client.
  const googleOAuthClient = new google.auth.OAuth2();
  googleOAuthClient.setCredentials({ access_token: token });

  return googleOAuthClient;
}
