import type { IncomingMessage, ServerResponse } from "node:http";
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import * as z from "zod";
import type { McpServerConfig } from "./config.js";
import { createStoreData } from "./store-data.js";
import type { OrderRecord } from "./store-data.js";
// Quickstart: import createAuthenticatedHandler from "./auth.js" here.
// Quickstart: import DownscopedTokenError, InsufficientScopeError, getCallerMcpClientOrThrow and withRequiredScopes from "@auth0/ai-mcp" here.
// Quickstart: import the scope constants and READ_*/WRITE_* scopes from "./scopes.js" here.

function failure(message: string) {
  return { ...text(message), isError: true as const };
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

/** An expected, user-facing failure. Its message is safe to return as is. */
class ToolFailure extends Error {}

/**
 * The starter has no caller identity yet, so every request acts as this one shopper and the tools
 * read the in-memory store directly. Once the Auth0 wiring is in, the caller comes from the
 * verified access token and the tools call the store API with exchanged tokens.
 */
// Quickstart: delete DEMO_SHOPPER, store and the store-data imports at the top; the caller comes from the access token and the data from the store API.
const DEMO_SHOPPER = "demo-shopper";
const store = createStoreData();

// Quickstart: add the Proof, ApiCall and OrderBody types and the callApi, proofOf, checkedBy and describeCause helpers here.
// Quickstart: replace guarded and add expectOk below with the versions that handle token errors.
/** Turns thrown errors into fixed messages. */
async function guarded(
  tool: string,
  run: () => Promise<ReturnType<typeof text>>,
) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ToolFailure) return failure(error.message);
    console.error(`${tool} failed`, error instanceof Error ? error.name : "unknown");
    return failure("Could not reach the store API.");
  }
}

/** Builds the MCP server for one request. The tools use `config` once they call the store API. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildServer(config: McpServerConfig): McpServer {
  const server = new McpServer({
    name: "store-example",
    title: "Store MCP server",
    version: "0.1.0",
  });

  // Tool 1: lists orders with stock levels.
  server.registerTool(
    "order_status_report",
    {
      description:
        "Shows the signed-in shopper's recent orders with current stock levels.",
      inputSchema: z.object({ order_id: z.string().min(1).optional() }),
      annotations: { readOnlyHint: true },
    },
    // Quickstart: wrap this handler with withRequiredScopes(SCOPE_ORDER_STATUS, ...) here.
    async ({ order_id: orderId }) =>
      guarded("order_status_report", async () => {
        // Quickstart: exchange the caller's token for the Orders and Inventory APIs here,
        // then call the store API with those tokens instead of reading the store directly.
        const found: OrderRecord[] =
          orderId === undefined
            ? store.orders(DEMO_SHOPPER)
            : [store.order(DEMO_SHOPPER, orderId)].filter(
                (order): order is OrderRecord => order !== undefined,
              );
        if (orderId !== undefined && found.length === 0) {
          throw new ToolFailure(`Order ${orderId} was not found.`);
        }
        const lines = found.map(
          (order) =>
            `- ${order.id} ${order.item} x${order.qty}, ${order.status}, stock left ${String(store.stock(order.sku))}`,
        );
        const header =
          orderId === undefined
            ? `Recent orders for ${DEMO_SHOPPER}:`
            : `Status of ${orderId} for ${DEMO_SHOPPER}:`;
        return text([header, ...lines].join("\n"));
      }),
  );

  // Tool 2: changes stock.
  server.registerTool(
    "fulfill_order",
    {
      description: "Fulfills an order by reserving its items in inventory.",
      inputSchema: z.object({ order_id: z.string().min(1) }),
      annotations: { destructiveHint: true },
    },
    // Quickstart: wrap this handler with withRequiredScopes(SCOPE_FULFILL, ...) here.
    async ({ order_id: orderId }) =>
      guarded("fulfill_order", async () => {
        // Quickstart: exchange the caller's token for the Orders and Inventory APIs here,
        // then call the store API with those tokens instead of reading the store directly.
        const order = store.order(DEMO_SHOPPER, orderId);
        if (!order) throw new ToolFailure(`Order ${orderId} was not found.`);
        const result = store.reserve(DEMO_SHOPPER, order.sku, order.qty, order.id);
        if (!result) throw new ToolFailure(`Order ${orderId} was not found.`);
        const headline = result.alreadyReserved
          ? `Order ${order.id} was already fulfilled (stock stays ${String(result.after)})`
          : `Order ${order.id} fulfilled: reserved ${order.qty} x ${order.item} (stock ${String(result.before)} -> ${String(result.after)})`;
        return text(headline);
      }),
  );

  // Tool 3: reports revenue.
  server.registerTool(
    "sales_analytics_report",
    {
      description: "Shows last month's revenue, fetched with the server's own credentials.",
      annotations: { readOnlyHint: true },
    },
    // Quickstart: wrap this handler with withRequiredScopes(SCOPE_ANALYTICS, ...) here.
    async () =>
      guarded("sales_analytics_report", async () => {
        // Quickstart: get a client credentials token for the Analytics API here,
        // then call the store API with it instead of using the fixed numbers below.
        return text(
          `Monthly revenue: $${(142000).toLocaleString("en-US")} | Top product: Enterprise Suite`,
        );
      }),
  );

  return server;
}

// Quickstart: delete readBody and createPlainHandler below once createAuthenticatedHandler serves the requests.
/** Reads the request body, if any. */
async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length === 0 ? undefined : Buffer.concat(chunks);
}

/** Serves MCP over Streamable HTTP with no authentication. Every request is accepted. */
function createPlainHandler(
  config: McpServerConfig,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(name, value);
    }
    const method = req.method ?? "GET";
    const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
    const request = new Request(new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`), {
      method,
      headers,
      ...(body !== undefined && { body: new Uint8Array(body) }),
    });
    const server = buildServer(config);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      responseHeaders[name] = value;
    });
    res.writeHead(response.status, responseHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
    await server.close();
  };
}

/** Returns a Node request listener that serves MCP requests. */
export function createMcpApp(
  config: McpServerConfig,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  // Quickstart: replace the next line with createAuthenticatedHandler(config, () => buildServer(config)).
  return createPlainHandler(config);
}
