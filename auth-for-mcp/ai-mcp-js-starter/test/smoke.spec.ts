import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setupServer } from "msw/node";
import { SignJWT, createLocalJWKSet } from "jose";
import {
  createAuth0Handlers,
  createTestKey,
  exportJwks,
  mintAccessToken,
  mintUnsignedToken,
  scopeMode,
} from "./support.js";
import type { TestKey } from "./support.js";
import type { DownstreamConfig, McpServerConfig } from "../src/config.js";
import { createDownstreamServer } from "../src/downstream-api.js";
import { createMcpApp } from "../src/mcp-app.js";

// Offline: Auth0 is replaced by MSW handlers; both servers listen on loopback.
const MCP_URL = "https://mcp.example.com/mcp";
const ORDERS = "https://orders.example.com";
const INVENTORY = "https://inventory.example.com";
const ANALYTICS = "https://analytics.example.com";

let key: TestKey;
let tenant: ReturnType<typeof createAuth0Handlers>;
let downstream: Server;
let mcp: Server;
let mcpPort: number;
let downstreamPort: number;

const msw = setupServer();

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve((server.address() as AddressInfo).port),
    );
  });
}

beforeAll(async () => {
  key = await createTestKey();
  tenant = createAuth0Handlers({ key, scope: scopeMode.echo });
  msw.listen({
    onUnhandledRequest(request, print) {
      if (new URL(request.url).hostname === "127.0.0.1") return;
      print.error();
    },
  });
  // The handlers come from the package test support, which may resolve its own copy of msw.
  msw.use(...(tenant.handlers as unknown as Parameters<typeof msw.use>));

  const downstreamConfig: DownstreamConfig = {
    domain: "tenant.example.com",
    ordersAudience: ORDERS,
    inventoryAudience: INVENTORY,
    analyticsAudience: ANALYTICS,
    port: 0,
  };
  downstream = createDownstreamServer(
    downstreamConfig,
    createLocalJWKSet(
      exportJwks(key) as Parameters<typeof createLocalJWKSet>[0],
    ),
  );
  downstreamPort = await listen(downstream);

  const mcpConfig: McpServerConfig = {
    domain: "tenant.example.com",
    serverUrl: MCP_URL,
    clientId: "mcp-client",
    clientSecret: "secret",
    requiredScopes: [],
    ordersAudience: ORDERS,
    inventoryAudience: INVENTORY,
    analyticsAudience: ANALYTICS,
    storeApiUrl: `http://127.0.0.1:${downstreamPort}`,
    downstreamTimeoutMs: 2000,
    port: 0,
  };
  const app = createMcpApp(mcpConfig);
  mcp = createServer((req, res) => void app(req, res));
  mcpPort = await listen(mcp);
});

afterEach(() => tenant.state.reset());
afterAll(async () => {
  msw.close();
  await Promise.all(
    [mcp, downstream].map((s) => new Promise((resolve) => s.close(resolve))),
  );
});

function rpc(method: string, params: Record<string, unknown> = {}) {
  return fetch(`http://127.0.0.1:${mcpPort}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const response = await rpc("tools/call", { name, arguments: args });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    result?: { isError?: boolean; content: Array<{ text: string }> };
  };
  return { text: body.result?.content[0]?.text ?? "", isError: body.result?.isError };
}

// The starter has no authentication yet: these tests describe the server before the quickstart.
describe("starter MCP server (no authentication)", () => {
  it("answers a request without a credential", async () => {
    const response = await rpc("tools/list");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((tool) => tool.name).sort()).toEqual([
      "fulfill_order",
      "order_status_report",
      "sales_analytics_report",
    ]);
  });

  it("lists the orders of the demo shopper with stock levels", async () => {
    const { text, isError } = await callTool("order_status_report");
    expect(isError).toBeUndefined();
    expect(text).toContain("Recent orders for demo-shopper:");
    expect(text).toContain("ORD-1002 Mechanical Keyboard x1, processing, stock left 12");
  });

  it("reports an unknown order", async () => {
    const { text, isError } = await callTool("order_status_report", { order_id: "ORD-9001" });
    expect(isError).toBe(true);
    expect(text).toBe("Order ORD-9001 was not found.");
  });

  it("fulfills an order once and changes stock", async () => {
    const first = await callTool("fulfill_order", { order_id: "ORD-1002" });
    expect(first.text).toContain("fulfilled: reserved 1 x Mechanical Keyboard (stock 12 -> 11)");
    const second = await callTool("fulfill_order", { order_id: "ORD-1002" });
    expect(second.text).toContain("was already fulfilled");
  });

  it("reports sales numbers", async () => {
    const { text } = await callTool("sales_analytics_report");
    expect(text).toBe("Monthly revenue: $142,000 | Top product: Enterprise Suite");
  });
});

describe("example store API", () => {
  function get(path: string, token?: string) {
    return fetch(`http://127.0.0.1:${downstreamPort}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  function mint(
    aud: string,
    scope: string,
    extra: { sub?: string; exp?: number } = {},
  ) {
    return mintAccessToken(key, {
      iss: tenant.issuer,
      aud,
      sub: extra.sub ?? "user|1",
      scope,
      ...(extra.exp !== undefined && { exp: extra.exp }),
    });
  }

  it("answers 401 without a token", async () => {
    const res = await get("/orders");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("answers 401 for a token issued for another service", async () => {
    expect((await get("/orders", await mint(INVENTORY, "read:orders"))).status).toBe(401);
    expect((await get("/inventory/SKU-HEAD-01", await mint(ORDERS, "read:inventory"))).status).toBe(401);
  });

  it("answers 403 when the scope is missing", async () => {
    const res = await get("/orders", await mint(ORDERS, "other:scope"));
    expect(res.status).toBe(403);
    expect(res.headers.get("www-authenticate")).toContain("insufficient_scope");
  });

  it("answers 200 with proof of what was checked", async () => {
    const res = await get("/orders", await mint(ORDERS, "read:orders"));
    const body = (await res.json()) as { orders: unknown[]; verified: object };
    expect(res.status).toBe(200);
    expect(body.orders).toHaveLength(3);
    expect(body.verified).toMatchObject({
      audience: ORDERS,
      scope: "read:orders",
      subject: "user|1",
    });
  });

  it("answers 404 for an unknown order, sku or route", async () => {
    expect((await get("/orders/ORD-0", await mint(ORDERS, "read:orders"))).status).toBe(404);
    expect((await get("/inventory/SKU-NONE", await mint(INVENTORY, "read:inventory"))).status).toBe(404);
    expect((await get("/nothing", await mint(ORDERS, "read:orders"))).status).toBe(404);
  });

  it("needs the write scope to reserve stock, and rejects bad bodies", async () => {
    const post = (token: string, body: string) =>
      fetch(`http://127.0.0.1:${downstreamPort}/inventory/SKU-DOCK-03/reserve`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body,
      });
    const readOnly = await mint(INVENTORY, "read:inventory");
    expect((await post(readOnly, "{}")).status).toBe(403);
    const writer = await mint(INVENTORY, "read:inventory write:inventory");
    expect((await post(writer, "not json")).status).toBe(400);
    expect((await post(writer, JSON.stringify({ qty: 0, order_id: "ORD-1003" }))).status).toBe(400);
    expect((await post(writer, JSON.stringify({ qty: 1, order_id: "ORD-0" }))).status).toBe(404);
  });

  describe("orders belong to the shopper who asks", () => {
    interface OrderBody {
      id: string;
      customer: string;
    }

    function reserve(token: string, sku: string, orderId: string) {
      return fetch(`http://127.0.0.1:${downstreamPort}/inventory/${sku}/reserve`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ qty: 1, order_id: orderId }),
      });
    }

    it("lists only the orders of the caller, each owned by the caller", async () => {
      const alice = await (await get("/orders", await mint(ORDERS, "read:orders", { sub: "user|alice" }))).json() as {
        orders: OrderBody[];
      };
      const bob = await (await get("/orders", await mint(ORDERS, "read:orders", { sub: "user|bob" }))).json() as {
        orders: OrderBody[];
      };

      expect(alice.orders.map((o) => o.id)).toEqual(["ORD-1001", "ORD-1002", "ORD-1003"]);
      expect(alice.orders.every((o) => o.customer === "user|alice")).toBe(true);
      expect(bob.orders.every((o) => o.customer === "user|bob")).toBe(true);
      expect([...alice.orders, ...bob.orders].map((o) => o.id)).not.toContain("ORD-9001");
    });

    it("answers 404 for an order that belongs to someone else", async () => {
      const token = await mint(ORDERS, "read:orders", { sub: "user|alice" });
      expect((await get("/orders/ORD-9001", token)).status).toBe(404);
      expect((await get("/orders/ORD-1001", token)).status).toBe(200);
    });

    it("does not let a shopper reserve stock for an order of someone else", async () => {
      const writer = await mint(INVENTORY, "read:inventory write:inventory", { sub: "user|alice" });
      expect((await reserve(writer, "SKU-DOCK-03", "ORD-9001")).status).toBe(404);
    });

    it("keeps reservations apart: the same order id of two shoppers reserves twice", async () => {
      const stockAfter = async (sub: string) => {
        const writer = await mint(INVENTORY, "read:inventory write:inventory", { sub });
        const body = (await (await reserve(writer, "SKU-HEAD-01", "ORD-1001")).json()) as {
          already_reserved: boolean;
          stock_before: number;
          stock_after: number;
        };
        return body;
      };

      const first = await stockAfter("user|carol");
      const second = await stockAfter("user|dave");
      const again = await stockAfter("user|carol");

      expect(first.already_reserved).toBe(false);
      expect(second.already_reserved).toBe(false);
      expect(second.stock_before).toBe(first.stock_after);
      expect(again.already_reserved).toBe(true);
    });
  });

  it("serves analytics only to a service token", async () => {
    const service = await mint(ANALYTICS, "read:analytics", { sub: "mcp-client@clients" });
    expect((await get("/analytics/monthly-revenue", service)).status).toBe(200);
    const user = await mint(ANALYTICS, "read:analytics");
    expect((await get("/analytics/monthly-revenue", user)).status).toBe(401);
  });

  it("answers 401 for a correctly signed token from another issuer", async () => {
    const token = await mintAccessToken(key, {
      iss: "https://other-tenant.example.com/",
      aud: ORDERS,
      sub: "user|1",
      scope: "read:orders",
    });
    expect((await get("/orders", token)).status).toBe(401);
  });

  it("answers 401 for an unsigned alg:none token", async () => {
    const token = mintUnsignedToken({
      iss: tenant.issuer,
      aud: ORDERS,
      sub: "user|1",
      scope: "read:orders",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect((await get("/orders", token)).status).toBe(401);
  });

  it("answers 401 for an HS256 token signed with the public key material", async () => {
    const secret = new TextEncoder().encode(JSON.stringify(key.publicJwk));
    const token = await new SignJWT({ scope: "read:orders" })
      .setProtectedHeader({ alg: "HS256", kid: key.kid })
      .setIssuer(tenant.issuer)
      .setAudience(ORDERS)
      .setSubject("user|1")
      .setExpirationTime("1h")
      .sign(secret);
    expect((await get("/orders", token)).status).toBe(401);
  });

  it("answers 401 for an expired token", async () => {
    const token = await mint(ORDERS, "read:orders", {
      exp: Math.floor(Date.now() / 1000) - 3600,
    });
    expect((await get("/orders", token)).status).toBe(401);
  });
});
