import { tool } from "ai";
import { google } from "googleapis";
import { z } from "zod/v3";

import { getAccessTokenFromTokenVault } from "@auth0/ai-vercel";

import type { ToolWrapper } from "@auth0/ai-vercel";

/**
 * Tool: listNearbyEvents
 * Lists calendar events between a start and end time from a specified calendar.
 * Uses the enhanced @auth0/ai SDK for token exchange with Token Vault.
 */
export const createListNearbyEventsTool = (
  googleCalendarWrapper: ToolWrapper
) =>
  googleCalendarWrapper(
    tool({
      description:
        "List calendar events between a given start and end time from a user's calendar (personal or shared)",
      inputSchema: z.object({
        start: z.coerce.date(),
        end: z.coerce.date(),
        calendarId: z.string().optional().default("primary"),
      }),
      execute: async ({ start, end, calendarId }) => {
        try {
          // Fix truncated calendar IDs by appending the correct suffix
          let fullCalendarId = calendarId;
          if (!calendarId.includes("@") && calendarId.startsWith("c_")) {
            fullCalendarId = `${calendarId}@group.calendar.google.com`;
          } else if (
            !calendarId.includes("@") &&
            !calendarId.startsWith("c_")
          ) {
            // For primary calendar (email format)
            fullCalendarId = calendarId; // Keep as is, it should be an email
          }

          // Get the access token from Token Vault using the enhanced SDK
          const token = getAccessTokenFromTokenVault();

          const calendar = google.calendar("v3");
          const auth = new google.auth.OAuth2();
          auth.setCredentials({ access_token: token });

          const response = await calendar.events.list({
            auth,
            calendarId: fullCalendarId,
            timeMin: start.toISOString(),
            timeMax: end.toISOString(),
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 10,
          });

          return {
            calendarId: fullCalendarId,
            events:
              response.data.items?.map((ev) => ({
                id: ev.id,
                summary: ev.summary,
                start: ev.start?.dateTime ?? ev.start?.date,
                end: ev.end?.dateTime ?? ev.end?.date,
                location: ev.location ?? "No location",
              })) ?? [],
          };
        } catch (error) {
          console.error("Error listing calendar events:", error);
          // Return a proper error result instead of throwing
          return {
            calendarId: calendarId,
            events: [],
            error: `Failed to list events: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          };
        }
      },
    })
  );
