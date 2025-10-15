import { addHours, formatISO } from "date-fns";
import { GaxiosError } from "gaxios";
import { google } from "googleapis";
import { z } from "zod";

import { getAccessTokenFromTokenVault } from "@auth0/ai-langchain";
import { TokenVaultError } from "@auth0/ai/interrupts";
import { tool } from "@langchain/core/tools";

import { withGoogleCalendar } from "../../auth0-ai";

export const viewCalendarEvents = withGoogleCalendar(
  tool(
    async ({ startDate, endDate, maxResults }) => {
      try {
        const accessToken = getAccessTokenFromTokenVault();

        const calendar = google.calendar("v3");
        const auth = new google.auth.OAuth2();

        auth.setCredentials({
          access_token: accessToken,
        });

        const response = await calendar.events.list({
          auth,
          calendarId: "primary",
          timeMin: formatISO(startDate),
          timeMax: endDate
            ? formatISO(endDate)
            : addHours(startDate, 24).toISOString(),
          maxResults: maxResults || 10,
          singleEvents: true,
          orderBy: "startTime",
        });

        const events = response.data.items || [];

        return {
          events: events.map((event) => ({
            id: event.id,
            summary: event.summary,
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            description: event.description,
            location: event.location,
          })),
          totalEvents: events.length,
        };
      } catch (err) {
        if (err instanceof GaxiosError && err.status === 401) {
          throw new TokenVaultError(
            `Authorization required to access the Token Vault`
          );
        }
        throw err;
      }
    },
    {
      name: "view_calendar_events",
      description: "View calendar events for a specific date range",
      schema: z.object({
        startDate: z.coerce
          .date()
          .describe("The start date to view events from"),
        endDate: z.coerce
          .date()
          .nullable()
          .default(null)
          .describe(
            "The end date to view events until (optional, defaults to 24 hours from start)"
          ),
        maxResults: z
          .number()
          .nullable()
          .default(10)
          .describe(
            "Maximum number of events to return (optional, defaults to 10)"
          ),
      }),
    }
  )
);
