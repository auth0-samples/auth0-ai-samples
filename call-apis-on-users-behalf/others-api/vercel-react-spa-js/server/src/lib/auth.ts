import { SUBJECT_TOKEN_TYPES } from "@auth0/ai";
import { Auth0AI } from "@auth0/ai-vercel";

import type { Context } from "hono";

import type { ToolWrapper } from "@auth0/ai-vercel";
// Create an Auth0AI instance configured with enhanced Custom API Client support
// NOTE: This demonstrates the enhanced API approach using client credentials
const auth0AI = new Auth0AI({
  auth0: {
    domain: process.env.AUTH0_DOMAIN!,
    // For token exchange with Token Vault, we need the Custom API Client credentials
    clientId: process.env.AUTH0_CUSTOM_API_CLIENT_ID!, // Custom API Client ID for token exchange
    clientSecret: process.env.AUTH0_CUSTOM_API_CLIENT_SECRET!, // Custom API Client secret
  },
});

// Enhanced token exchange with Token Vault, setup with access token support
// This demonstrates the new API pattern where access tokens can be used directly
export const createGoogleCalendarTool = (c: Context): ToolWrapper => {
  const accessToken = c.get("auth")?.token;

  if (!accessToken) {
    throw new Error("Access token not available in auth context");
  }

  return auth0AI.withTokenVault({
    accessToken: async () => accessToken,
    subjectTokenType: SUBJECT_TOKEN_TYPES.SUBJECT_TYPE_ACCESS_TOKEN,
    connection: process.env.GOOGLE_CONNECTION_NAME || "google-oauth2",
    scopes: [
      "openid",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly", // Read-only access to calendar list
      "https://www.googleapis.com/auth/calendar.events.readonly", // Read-only access to events
    ],
  });
};
