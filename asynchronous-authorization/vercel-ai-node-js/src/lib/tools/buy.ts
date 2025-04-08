import "dotenv/config";

import { tool } from "ai";
import { z } from "zod";

import { Auth0AI, getCIBACredentials } from "@auth0/ai-vercel";
import { AccessDeniedInterrupt } from "@auth0/ai/interrupts";
import { Context } from "../../types/ai-context";

const auth0AI = new Auth0AI();

export const buy = (context: Context) => {
  const withAsyncAuthorization = auth0AI.withAsyncUserConfirmation({
    userID: context.userID,
    bindingMessage: async ({ ticker, qty }) =>
      `Do you want to buy ${qty} shares of ${ticker}`,
    scopes: ["openid", "stock:trade"],
    audience: process.env["AUDIENCE"]!,
    /**
     * When this flag is set to `block`, the execution of the tool awaits
     * until the user approves or rejects the request.
     *
     * Given the asynchronous nature of the CIBA flow, this mode
     * is only useful during development.
     *
     * In practice, the process that is awaiting the user confirmation
     * could crash or timeout before the user approves the request.
     *
     * For a more real world scenario refer to `https://github.com/auth0-lab/auth0-ai-js/demos/vercel-ai-agent`.
     */
    onAuthorizationRequest: "block",
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
      parameters: z.object({
        ticker: z.string(),
        qty: z.number(),
      }),
      execute: async ({ ticker, qty }) => {
        const headers = {
          "Content-Type": "application/json",
        };
        const body = {
          ticker: ticker,
          qty: qty,
        };
        const credentials = getCIBACredentials();
        const accessToken = credentials?.accessToken?.value;

        if (accessToken) {
          headers["Authorization"] = "Bearer " + accessToken;
        }

        console.log("Executing request to buy stock");

        const response = await fetch(process.env["STOCK_API_URL"]!, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(body),
        });

        return response.statusText;
      },
    })
  );
};
