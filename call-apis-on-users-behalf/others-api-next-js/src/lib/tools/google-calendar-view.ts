import { tool } from "ai";
import { z } from "zod";
import { google } from "googleapis";
import { getGoogleAuth } from "../google";

// Define a Vercel AI SDK tool.
export const googleCalendarViewTool = tool({
  description:
    "Check a user's schedule between the given date times on their calendar",
  parameters: z.object({
    timeMin: z.string().datetime().describe("Start time in ISO 8601 format"),
    timeMax: z.string().datetime().describe("End time in ISO 8601 format"),
    timeZone: z
      .string()
      .optional()
      .describe("Time zone to use for the calendar"),
  }),

  execute: async ({ timeMin, timeMax, timeZone }) => {
    // Get Google OAuth client with access token via Auth0.
    const auth = await getGoogleAuth();
    const calender = google.calendar({ version: "v3", auth });

    // Get calendar events for given query.
    const response = await calender.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      timeZone,
    });

    return {
      status: "success",
      startDate: timeMin,
      endDate: timeMax,
      events: response?.data?.items,
    };
  },
});
