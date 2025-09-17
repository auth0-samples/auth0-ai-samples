import { getAccessTokenForConnection } from "@auth0/ai-langchain";
import { GmailSearch } from "@langchain/community/tools/gmail";

import { withGmailCommunity } from "../../lib/auth0-ai";

export const gmailCommunityTool = withGmailCommunity(
  new GmailSearch({
    credentials: {
      accessToken: async () => getAccessTokenForConnection(),
    },
  })
);
