import { getAccessTokenFromTokenVault } from "@auth0/ai-langchain";
import { GoogleCalendarViewTool } from "@langchain/community/tools/google_calendar";
import { ChatOpenAI } from "@langchain/openai";

import { withGoogleCalendarCommunity } from "../../auth0-ai";

const model = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
});

export const calendarCommunityTool = withGoogleCalendarCommunity(
  new GoogleCalendarViewTool({
    credentials: {
      accessToken: async () => getAccessTokenFromTokenVault(),
      calendarId: "primary",
    },
    model,
  })
);
