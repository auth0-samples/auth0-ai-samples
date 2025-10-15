import { SUBJECT_TOKEN_TYPES } from "@auth0/ai";
import { Auth0AI } from "@auth0/ai-langchain";

const auth0AI = new Auth0AI({
  auth0: {
    domain: process.env.AUTH0_DOMAIN!,
    clientId: process.env.CUSTOM_API_CLIENT_ID!, // Resource server client ID for token exchange
    clientSecret: process.env.CUSTOM_API_CLIENT_SECRET!, // Resource server client secret
  },
});

const withAccessTokenForConnection = (connection: string, scopes: string[]) =>
  auth0AI.withTokenVault({
    connection,
    scopes,
    accessToken: async (_, config) => {
      return config.configurable?.langgraph_auth_user?.getRawAccessToken();
    },
    subjectTokenType: SUBJECT_TOKEN_TYPES.SUBJECT_TYPE_ACCESS_TOKEN,
  });

export const withGmailSearch = withAccessTokenForConnection(
  "google-oauth2",
  ['https://www.googleapis.com/auth/gmail.readonly']
);
