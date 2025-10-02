import { SUBJECT_TOKEN_TYPES } from "@auth0/ai";
import { Auth0AI } from "@auth0/ai-langchain";

const auth0AI = new Auth0AI({
  auth0: {
    domain: process.env.AUTH0_DOMAIN!,
    clientId: process.env.AUTH0_CUSTOM_API_CLIENT_ID!,
    clientSecret: process.env.AUTH0_CUSTOM_API_CLIENT_SECRET!,
  },
});

export const withAccessTokenForConnection = (
  connection: string,
  scopes: string[]
) =>
  auth0AI.withTokenVault({
    connection,
    scopes,
    accessToken: async (_, config) => {
      return config.configurable?.langgraph_auth_user?.getRawAccessToken();
    },
    subjectTokenType: SUBJECT_TOKEN_TYPES.SUBJECT_TYPE_ACCESS_TOKEN,
  });

export const withGoogleCalendar = withAccessTokenForConnection(
  "google-oauth2",
  ["https://www.googleapis.com/auth/calendar.freebusy"]
);

export const withGoogleCalendarCommunity = withAccessTokenForConnection(
  "google-oauth2",
  [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ]
);
