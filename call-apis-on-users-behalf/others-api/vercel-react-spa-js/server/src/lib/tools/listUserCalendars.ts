import { tool } from "ai";
import { google } from "googleapis";
import { z } from "zod/v3";

import { getAccessTokenFromTokenVault } from "@auth0/ai-vercel";

import type { ToolWrapper } from "@auth0/ai-vercel";

/**
 * Tool: listUserCalendars
 * Lists all calendars the user has access to.
 * Uses the enhanced @auth0/ai SDK for token exchange with Token Vault.
 */

// Define the input schema (empty for this tool)
const listUserCalendarsSchema = z.object({});

// Infer the type from the schema
type ListUserCalendarsInput = z.infer<typeof listUserCalendarsSchema>;

export const createListUserCalendarsTool = (
  googleCalendarWrapper: ToolWrapper
) => {
  const baseTool = tool({
    description: "List all calendars the user has access to",
    inputSchema: listUserCalendarsSchema as any,
    execute: async (_input: ListUserCalendarsInput) => {
        // Get the access token from Token Vault using the enhanced SDK
        const token = getAccessTokenFromTokenVault();

        const calendar = google.calendar("v3");
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: token });

        const res = await calendar.calendarList.list({ auth });

        const calendars =
          res.data.items?.map((cal) => ({
            id: cal.id,
            name: cal.summary,
            accessRole: cal.accessRole,
          })) ?? [];

        return calendars;
      },
    });

  return googleCalendarWrapper(baseTool as any);
};
