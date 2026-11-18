import { UserError } from "fastmcp";
import type { FastMCP } from "fastmcp";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import { createOrdersData } from "./orders-data.js";
// Quickstart: import getCallerMcpClientOrThrow from "@auth0/ai-mcp" here.
// Quickstart: import withAuth0Execute and the Auth0Session type from "@auth0/ai-fastmcp" here.
// Quickstart: import SCOPE_CANCEL_ORDER, READ_ORDERS and WRITE_ORDERS from "./scopes.js" here.

/**
 * The starter has no caller identity yet, so every request acts as this one shopper and the tools
 * read the in-memory orders directly. Once the Auth0 wiring is in, the caller comes from the
 * verified access token and the tools call the orders API with exchanged tokens.
 */
const DEMO_SHOPPER = "demo-shopper";
const ordersData = createOrdersData();

// Quickstart: add the ApiCall type, ordersApiUrl, callOrdersApi, expectOk and checkedBy helpers here.

/**
 * Registers the tools. They contain no Auth0 setup yet.
 */
// Quickstart: type the server parameter as FastMCP<Auth0Session> here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerTools(server: FastMCP, config: AppConfig): void {
  // Tool 1: any caller may run it.
  server.addTool({
    name: "whoami",
    description: "Describes the signed-in caller.",
    parameters: z.object({}),
    annotations: { readOnlyHint: true },
    // Quickstart: wrap this function with withAuth0Execute and describe session.principal here.
    execute: async () => `Signed in as ${DEMO_SHOPPER} (no authentication yet)`,
  });

  // Tool 2: lists the shopper's orders.
  server.addTool({
    name: "list_orders",
    description: "Lists the signed-in shopper's orders.",
    parameters: z.object({}),
    annotations: { readOnlyHint: true },
    // Quickstart: wrap this function with withAuth0Execute here.
    execute: async () => {
      // Quickstart: exchange the caller's token for a read:orders token here,
      // then call the orders API with it instead of reading the orders directly.
      const orders = ordersData.orders(DEMO_SHOPPER);
      const lines = orders.map((order) => `- ${order.id} ${order.item} x${order.qty}, ${order.status}`);
      return [`Orders of ${DEMO_SHOPPER}:`, ...lines].join("\n");
    },
  });

  // Tool 3: cancels an order that has not shipped.
  server.addTool({
    name: "cancel_order",
    description: "Cancels an order that has not shipped.",
    parameters: z.object({ order_id: z.string().min(1) }),
    annotations: { destructiveHint: true },
    // Quickstart: wrap this function with withAuth0Execute(..., { requiredScopes: SCOPE_CANCEL_ORDER }) here.
    execute: async ({ order_id: orderId }) => {
      // Quickstart: exchange the caller's token for a write:orders token here,
      // then call the orders API with it instead of changing the orders directly.
      const result = ordersData.cancel(DEMO_SHOPPER, orderId);
      if (result === "not_found") throw new UserError(`Order ${orderId} was not found.`);
      if (result === "shipped") throw new UserError(`Order ${orderId} has shipped and cannot be cancelled.`);
      return result === "already_cancelled"
        ? `Order ${orderId} was already cancelled`
        : `Order ${orderId} cancelled`;
    },
  });
}
