import { UserError } from "fastmcp";
import type { FastMCP } from "fastmcp";
import { z } from "zod";
import { getCallerMcpClientOrThrow } from "@auth0/ai-mcp";
import { withAuth0Execute } from "@auth0/ai-fastmcp";
import type { Auth0Session } from "@auth0/ai-fastmcp";
import type { AppConfig } from "./config.js";
import { READ_ORDERS, SCOPE_CANCEL_ORDER, WRITE_ORDERS } from "./scopes.js";

interface ApiCall {
  status: number;
  body: Record<string, unknown>;
}

/**
 * The URL of a path below the base URL of the orders API. The base may have a path of its own
 * (`http://host/api`), and `path` is relative to it, so the base keeps its path with or without a
 * trailing slash. A path with a leading slash would replace the path of the base.
 */
function ordersApiUrl(base: string, path: string): URL {
  return new URL(path, base.endsWith("/") ? base : `${base}/`);
}

/** Calls the orders API with an exchanged token. Only the exchanged token is sent. */
async function callOrdersApi(
  config: AppConfig,
  token: string,
  path: string,
  method: "GET" | "POST" = "GET",
): Promise<ApiCall> {
  const response = await fetch(ordersApiUrl(config.ordersApiUrl, path), {
    method,
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(config.downstreamTimeoutMs),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body };
}

/** An answer the caller may see as it is. FastMCP passes the message of a `UserError` on. */
function expectOk(call: ApiCall): void {
  if (call.status !== 200) {
    throw new UserError(`The orders API answered ${call.status}.`);
  }
}

function checkedBy(call: ApiCall): string {
  const proof = call.body["verified"] as { audience: string; scope: string; actor: string | null };
  return `Checked by the orders API: aud ${proof.audience}, scope ${proof.scope}, acting client ${proof.actor ?? "none in the token"}`;
}

interface OrderBody {
  id: string;
  item: string;
  qty: number;
  status: string;
}

/**
 * Registers the tools. They contain no Auth0 setup: `withAuth0Execute` hands them the caller that
 * `authenticate` verified, and the session client exchanges that caller's token for a token to
 * the orders API.
 */
export function registerTools(server: FastMCP<Auth0Session>, config: AppConfig): void {
  // Tool 1: any signed-in caller may run it. No scope beyond the server-wide ones.
  server.addTool({
    name: "whoami",
    description: "Describes the signed-in caller.",
    parameters: z.object({}),
    annotations: { readOnlyHint: true },
    execute: withAuth0Execute(async (_args, { session }) => {
      const { principal } = session;
      return [
        `Signed in as ${principal.sub}`,
        `Client: ${principal.clientId ?? "unknown"}`,
        `Scopes: ${principal.scopes.join(" ") || "none"}`,
      ].join("\n");
    }),
  });

  // Tool 2: exchanges the caller's token for a read-only token to the orders API. The accessor
  // finds the caller's client inside the wrapped function.
  server.addTool({
    name: "list_orders",
    description: "Lists the signed-in shopper's orders.",
    parameters: z.object({}),
    annotations: { readOnlyHint: true },
    execute: withAuth0Execute(
      async () => {
        const token = await getCallerMcpClientOrThrow().getTokenOnBehalfOf({
          audience: config.ordersAudience,
          scope: READ_ORDERS,
        });
        const call = await callOrdersApi(config, token.accessToken, "orders");
        expectOk(call);
        const orders = call.body["orders"] as OrderBody[];
        const lines = orders.map((order) => `- ${order.id} ${order.item} x${order.qty}, ${order.status}`);
        return [`Orders of ${String((call.body["verified"] as { subject: string }).subject)}:`, ...lines, checkedBy(call)].join("\n");
      },
    ),
  });

  // Tool 3: needs a scope of its own, then exchanges for a token that may write.
  server.addTool({
    name: "cancel_order",
    description: "Cancels an order that has not shipped.",
    parameters: z.object({ order_id: z.string().min(1) }),
    annotations: { destructiveHint: true },
    execute: withAuth0Execute(
      async ({ order_id: orderId }, { session }) => {
        const token = await session.mcpClient.getTokenOnBehalfOf({
          audience: config.ordersAudience,
          scope: WRITE_ORDERS,
        });
        const call = await callOrdersApi(
          config,
          token.accessToken,
          `orders/${encodeURIComponent(orderId)}/cancel`,
          "POST",
        );
        if (call.status === 404) throw new UserError(`Order ${orderId} was not found.`);
        if (call.status === 409) throw new UserError(`Order ${orderId} has shipped and cannot be cancelled.`);
        expectOk(call);
        const headline =
          call.body["result"] === "already_cancelled"
            ? `Order ${orderId} was already cancelled`
            : `Order ${orderId} cancelled`;
        return [headline, checkedBy(call)].join("\n");
      },
      { requiredScopes: SCOPE_CANCEL_ORDER },
    ),
  });
}
