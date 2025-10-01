import { addHours, formatISO } from "date-fns";
import { GaxiosError } from "gaxios";
import { google } from "googleapis";
import { z } from "zod";

import { getAccessTokenFromTokenVault } from "@auth0/ai-langchain";
import { TokenVaultError } from "@auth0/ai/interrupts";
import { tool } from "@langchain/core/tools";

import { withGoogleCalendar } from "../../auth0-ai";

export const checkUsersCalendar = withGoogleCalendar(
  tool(
    async ({ date }) => {
      try {
        const accessToken = getAccessTokenFromTokenVault();

        const calendar = google.calendar("v3");
        const auth = new google.auth.OAuth2();

        auth.setCredentials({
          access_token: accessToken,
        });

        const response = await calendar.freebusy.query({
          auth,
          requestBody: {
            timeMin: formatISO(date),
            timeMax: addHours(date, 1).toISOString(),
            timeZone: "UTC",
            items: [{ id: "primary" }],
          },
        });

        return {
          available: response.data?.calendars?.primary?.busy?.length === 0,
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
      name: "check_user_calendar",
      description:
        "Use this function to check if the user is available on a certain date and time",
      schema: z.object({
        date: z.coerce.date(),
      }),
    }
  )
);
