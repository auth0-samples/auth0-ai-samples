import type { IncomingMessage, ServerResponse } from "node:http";
import {
  DownscopedTokenError,
  InsufficientScopeError,
  getCallerMcpClientOrThrow,
  withRequiredScopes,
} from "@auth0/ai-mcp";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { createAuthenticatedHandler } from "./auth.js";
import type { McpServerConfig } from "./config.js";
import {
  READ_ANALYTICS,
  READ_INVENTORY,
  READ_ORDERS,
  SCOPE_ANALYTICS,
  SCOPE_FULFILL,
  SCOPE_ORDER_STATUS,
  WRITE_INVENTORY,
} from "./scopes.js";

function failure(message: string) {
  return { ...text(message), isError: true as const };
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

/** An expected, user-facing failure. Its message is safe to return as is. */
class ToolFailure extends Error {}

interface Proof {
  audience: string;
  scope: string;
  actor: string | null;
}

interface ApiCall {
  status: number;
  body: Record<string, unknown>;
}

/** Calls the store API with an exchanged token. Only the exchanged token is sent. */
async function callApi(
  config: McpServerConfig,
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiCall> {
  const response = await fetch(new URL(path, config.storeApiUrl), {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body !== undefined && { "content-type": "application/json" }),
    },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    signal: AbortSignal.timeout(config.downstreamTimeoutMs),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body };
}

function proofOf(call: ApiCall): Proof {
  return call.body["verified"] as Proof;
}

function checkedBy(parts: Array<[string, Proof]>): string {
  const rendered = parts.map(
    ([name, p]) =>
      `${name} (aud ${p.audience}, scope ${p.scope}, acting client ${p.actor ?? "n/a"})`,
  );
  return `Checked by: ${rendered.join(", ")}`;
}

interface OrderBody {
  id: string;
  item: string;
  sku: string;
  qty: number;
  status: string;
}

/**
 * The original failure behind a sanitized token error, as one line for the server log. The token
 * calls attach it as `cause`, and the authorization server's own answer (its `error` and
 * `error_description`) sits a level deeper. That
 * detail is what you need to diagnose a first run, so it goes to the log and never to the tool
 * result.
 */
function describeCause(error: unknown): string {
  const parts: string[] = [];
  let cause: unknown = error instanceof Error ? error.cause : undefined;
  for (let depth = 0; depth < 3 && typeof cause === "object" && cause !== null; depth++) {
    const fields = cause as Record<string, unknown>;
    const pieces = [
      fields["name"],
      fields["code"],
      fields["statusCode"],
      fields["error"],
      fields["error_description"],
      fields["message"],
    ].filter((v): v is string | number => typeof v === "string" || typeof v === "number");
    parts.push(pieces.join(" "));
    cause = fields["cause"];
  }
  return parts.length === 0 ? "none" : parts.join(" <- ");
}

/**
 * Turns thrown errors into fixed messages. The error name and its causes go to the server log,
 * never to the tool result, and the message of the error itself is not logged.
 */
async function guarded(
  tool: string,
  run: () => Promise<ReturnType<typeof text>>,
) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ToolFailure) return failure(error.message);
    console.error(
      `${tool} failed`,
      error instanceof Error ? error.name : "unknown",
      `cause: ${describeCause(error)}`,
    );
    if (
      error instanceof DownscopedTokenError ||
      error instanceof InsufficientScopeError
    ) {
      return failure("The store API did not grant the required access.");
    }
    return failure("Could not reach the store API.");
  }
}

function expectOk(call: ApiCall): void {
  if (call.status !== 200) {
    throw new ToolFailure(`The store API answered ${call.status}.`);
  }
}

/** Builds the MCP server for one request. Tools read the caller from the request context. */
function buildServer(config: McpServerConfig): McpServer {
  const server = new McpServer({
    name: "store-example",
    title: "Store MCP server",
    version: "0.1.0",
  });

  // Tool 1: two on-behalf-of exchanges, one per store API. The request-scoped
  // client always acts for the caller of this request.
  server.registerTool(
    "order_status_report",
    {
      description:
        "Shows the signed-in shopper's recent orders with current stock levels.",
      inputSchema: z.object({ order_id: z.string().min(1).optional() }),
      annotations: { readOnlyHint: true },
    },
    withRequiredScopes(SCOPE_ORDER_STATUS, async ({ order_id: orderId }) =>
      guarded("order_status_report", async () => {
        const client = getCallerMcpClientOrThrow();
        const orders = await client.getTokenOnBehalfOf({
          audience: config.ordersAudience,
          scope: READ_ORDERS,
        });
        const inventory = await client.getTokenOnBehalfOf({
          audience: config.inventoryAudience,
          scope: READ_INVENTORY,
        });
        const list = await callApi(
          config,
          orders.accessToken,
          orderId === undefined ? "/orders" : `/orders/${encodeURIComponent(orderId)}`,
        );
        if (orderId !== undefined && list.status === 404) {
          throw new ToolFailure(`Order ${orderId} was not found.`);
        }
        expectOk(list);
        const found =
          orderId === undefined
            ? (list.body["orders"] as OrderBody[])
            : [list.body["order"] as OrderBody];
        const lines: string[] = [];
        let inventoryProof: Proof | undefined;
        for (const order of found) {
          const stock = await callApi(
            config,
            inventory.accessToken,
            `/inventory/${encodeURIComponent(order.sku)}`,
          );
          expectOk(stock);
          inventoryProof = proofOf(stock);
          lines.push(
            `- ${order.id} ${order.item} x${order.qty}, ${order.status}, stock left ${String(stock.body["stock"])}`,
          );
        }
        const subject = (list.body["verified"] as { subject: string }).subject;
        const header =
          orderId === undefined
            ? `Recent orders for ${subject}:`
            : `Status of ${orderId} for ${subject}:`;
        const proofs: Array<[string, Proof]> = [["Orders", proofOf(list)]];
        if (inventoryProof) proofs.push(["Inventory", inventoryProof]);
        return text([header, ...lines, checkedBy(proofs)].join("\n"));
      }),
    ),
  );

  // Tool 2: changes stock. Asks Orders for the same token as tool 1, so a repeat
  // call right after a status report reuses the cached Orders token.
  server.registerTool(
    "fulfill_order",
    {
      description: "Fulfills an order by reserving its items in inventory.",
      inputSchema: z.object({ order_id: z.string().min(1) }),
      annotations: { destructiveHint: true },
    },
    withRequiredScopes(SCOPE_FULFILL, async ({ order_id: orderId }) =>
      guarded("fulfill_order", async () => {
        const client = getCallerMcpClientOrThrow();
        const orders = await client.getTokenOnBehalfOf({
          audience: config.ordersAudience,
          scope: READ_ORDERS,
        });
        const inventory = await client.getTokenOnBehalfOf({
          audience: config.inventoryAudience,
          scope: `${READ_INVENTORY} ${WRITE_INVENTORY}`,
        });
        const lookup = await callApi(
          config,
          orders.accessToken,
          `/orders/${encodeURIComponent(orderId)}`,
        );
        if (lookup.status === 404) {
          throw new ToolFailure(`Order ${orderId} was not found.`);
        }
        expectOk(lookup);
        const order = lookup.body["order"] as OrderBody;
        const reserve = await callApi(
          config,
          inventory.accessToken,
          `/inventory/${encodeURIComponent(order.sku)}/reserve`,
          { method: "POST", body: { qty: order.qty, order_id: order.id } },
        );
        expectOk(reserve);
        const before = reserve.body["stock_before"];
        const after = reserve.body["stock_after"];
        const headline =
          reserve.body["already_reserved"] === true
            ? `Order ${order.id} was already fulfilled (stock stays ${String(after)})`
            : `Order ${order.id} fulfilled: reserved ${order.qty} x ${order.item} (stock ${String(before)} -> ${String(after)})`;
        return text(
          [
            headline,
            checkedBy([
              ["Orders", proofOf(lookup)],
              ["Inventory", proofOf(reserve)],
            ]),
          ].join("\n"),
        );
      }),
    ),
  );

  // Tool 3: the server acts as itself, with no shopper involved.
  server.registerTool(
    "sales_analytics_report",
    {
      description: "Shows last month's revenue, fetched with the server's own credentials.",
      annotations: { readOnlyHint: true },
    },
    withRequiredScopes(SCOPE_ANALYTICS, async () =>
      guarded("sales_analytics_report", async () => {
        const token = await getCallerMcpClientOrThrow().getClientCredentialsToken({
          audience: config.analyticsAudience,
          scope: READ_ANALYTICS,
        });
        const call = await callApi(
          config,
          token.accessToken,
          "/analytics/monthly-revenue",
        );
        expectOk(call);
        const revenue = Number(call.body["revenue_usd"]);
        const p = proofOf(call);
        return text(
          [
            `Monthly revenue: $${revenue.toLocaleString("en-US")} | Top product: ${String(call.body["top_product"])}`,
            `Checked by: Analytics (aud ${p.audience}, scope ${p.scope}, service token for the server itself)`,
          ].join("\n"),
        );
      }),
    ),
  );

  return server;
}

/** Returns a Node request listener that authenticates and serves MCP requests. */
export function createMcpApp(
  config: McpServerConfig,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return createAuthenticatedHandler(config, () => buildServer(config));
}
