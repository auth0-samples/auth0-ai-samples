import { getAccessTokenFromTokenVault } from "@auth0/ai-langchain";
import { GmailSearch } from "@langchain/community/tools/gmail";

import { withGmailSearch } from "../../lib/auth0-ai";

export const gmailSearchTool = withGmailSearch(
  new GmailSearch({
    credentials: {
      accessToken: async () => getAccessTokenFromTokenVault(),
    },
  })
);
