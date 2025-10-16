import { Auth0AI } from '@auth0/ai-langchain';
import { SUBJECT_TOKEN_TYPES } from "@auth0/ai";

const auth0AI = new Auth0AI({
  auth0: {
    domain: process.env.AUTH0_DOMAIN!,
    clientId: process.env.AUTH0_CUSTOM_API_CLIENT_ID!,
    clientSecret: process.env.AUTH0_CUSTOM_API_CLIENT_SECRET!,
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

// Connection for Google services
export const withGmailSearch = withAccessTokenForConnection(
  'google-oauth2',
  ['https://www.googleapis.com/auth/gmail.readonly'],
);
