import "dotenv/config";

import { tool } from "ai";
import { z } from "zod";

import { Auth0AI, getAsyncAuthorizationCredentials, type ToolWrapper } from "@auth0/ai-vercel";
import { AccessDeniedInterrupt } from "@auth0/ai/interrupts";

export type Context = {
  userId: string;
};

const auth0AI = new Auth0AI();

export const buy = (context: Context) => {
  const withAsyncAuthorization: ToolWrapper = auth0AI.withAsyncAuthorization({
    userID: context.userId,
    bindingMessage: async ({ ticker, qty }: { ticker: string; qty: number }) =>
      `Do you want to buy ${qty} shares of ${ticker}`,
    scopes: ["openid", "trade:stock"],
    audience: process.env["STOCK_API_AUDIENCE"]!,
    /**
     * Note: Setting a requested expiry greater than 300 (seconds) will force email verification
     * instead of using the push notification flow.
     */
    // requestedExpiry: 301,

    /**
     * The behavior when the authorization request is made.
     *
     * - `block`: The tool execution is blocked until the user completes the authorization.
     * - `interrupt`: The tool execution is interrupted until the user completes the authorization.
     * - a callback: Same as "block" but give access to the auth request and executing logic.
     *
     * Defaults to `interrupt`.
     *
     * When this flag is set to `block`, the execution of the tool awaits
     * until the user approves or rejects the request.
     * Given the asynchronous nature of the CIBA flow, this mode
     * is only useful during development.
     *
     * In practice, the process that is awaiting the user confirmation
     * could crash or timeout before the user approves the request.
     */
    onAuthorizationRequest: async (_authReq, creds) => {
      console.log(
        `An authorization request was sent to your mobile device or your email.`
      );
      await creds;
      console.log(`Thanks for approving the order.`);
    },

    onUnauthorized: async (e: Error) => {
      if (e instanceof AccessDeniedInterrupt) {
        return "The user has deny the request";
      }
      return e.message;
    },
  });

  return withAsyncAuthorization(
    tool({
      description: "Use this function to buy stock",
      inputSchema: z.object({
        ticker: z.string(),
        qty: z.number(),
      }),
      execute: async ({ ticker, qty }) => {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const credentials = getAsyncAuthorizationCredentials();
        const accessToken = credentials?.accessToken;
        if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

        console.log("Executing request to buy stock");

        const response = await fetch(process.env["STOCK_API_URL"]!, {
          method: "POST",
          headers,
          body: JSON.stringify({ ticker, qty }),
        });

        return response.statusText;
      },
    })
  );
};
