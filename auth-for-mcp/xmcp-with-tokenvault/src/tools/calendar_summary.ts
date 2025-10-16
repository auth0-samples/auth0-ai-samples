import { InferSchema, type ToolMetadata } from "xmcp";
import auth0Mcp, { apiClient } from "../auth0";
import { google } from "googleapis";
import { createGoogleAuthClient } from "../google-auth";

/**
 * Schema definition for whoami tool parameters, following the XMCP tool export convention.
 * This tool takes no parameters, but exporting it for consistency.
 */
export const schema = {} as const;

/**
 * Metadata for the whoami tool, following the XMCP tool export convention.
 */
export const metadata: ToolMetadata = {
  name: "calendar_summary",
  description: "Returns a summary of the user's Google Calendar events",
  annotations: {
    title: "What's on my Calendar?",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
} as const;

/**
 * Calendar summary tool with Auth0 scope-based authorization, following the XMCP tool export convention.
 */
export default auth0Mcp.requireScopes(
  ["tool:calendar_summary"],
  async (_params: InferSchema<typeof schema>, { authInfo }) => {
    const googleTokenSet = await apiClient.getAccessTokenForConnection({
      accessToken: authInfo.token,
      connection: "google-oauth2",
    });

    // Create Google OAuth2 client with the access token
    const auth = createGoogleAuthClient(googleTokenSet.accessToken);
    const calendar = google.calendar({ version: "v3", auth });

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch today's calendar events
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: today.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items || [];
    
    let summaryText = `Calendar Summary for ${today.toDateString()}\n\n`;
    
    if (events.length === 0) {
      summaryText += "No events scheduled for today.";
    } else {
      summaryText += `You have ${events.length} event(s) today:\n\n`;
      events.forEach((event, index) => {
        const start = event.start?.dateTime || event.start?.date;
        const end = event.end?.dateTime || event.end?.date;
        const startTime = start ? new Date(start).toLocaleTimeString() : "All day";
        const endTime = end ? new Date(end).toLocaleTimeString() : "";
        
        summaryText += `${index + 1}. ${event.summary || "Untitled Event"}\n`;
        summaryText += `   Time: ${startTime}${endTime ? ` - ${endTime}` : ""}\n`;
        if (event.location) {
          summaryText += `   Location: ${event.location}\n`;
        }
        if (event.description) {
          summaryText += `   Description: ${event.description}\n`;
        }
        summaryText += "\n";
      });
    }

    return {
      content: [
        {
          type: "text",
          text: summaryText,
        },
      ],
    };
  }
);
