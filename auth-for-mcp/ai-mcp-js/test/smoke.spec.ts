import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
const ALL_TOOLS = "openid tool:order_status_report tool:fulfill_order tool:sales_analytics_report";

let key: TestKey;
let tenant: ReturnType<typeof createAuth0Handlers>;
let downstream: Server;
let mcp: Server;
let mcpPort: number;
let downstreamPort: number;
let failingUpstream: Server;
let failingMcp: Server;
let failingMcpPort: number;
let scopedMcp: Server;
let scopedMcpPort: number;

/** What a failing store API says. It must never reach a tool result. */
const UPSTREAM_SECRET = "UPSTREAM-SECRET-TEXT";

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

  // A second MCP server whose store API answers every call with an error that carries a body.
  failingUpstream = createServer((_req, res) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: UPSTREAM_SECRET, detail: `${UPSTREAM_SECRET} internal.example.com` }));
  });
  const failingUpstreamPort = await listen(failingUpstream);
  const failingApp = createMcpApp({ ...mcpConfig, storeApiUrl: `http://127.0.0.1:${failingUpstreamPort}` });
  failingMcp = createServer((req, res) => void failingApp(req, res));
  failingMcpPort = await listen(failingMcp);

  // A third MCP server that needs a scope on every request.
  const scopedApp = createMcpApp({ ...mcpConfig, requiredScopes: ["store:read"] });
  scopedMcp = createServer((req, res) => void scopedApp(req, res));
  scopedMcpPort = await listen(scopedMcp);
});

afterEach(() => tenant.state.reset());
afterAll(async () => {
  msw.close();
  await Promise.all(
    [mcp, downstream, failingMcp, failingUpstream, scopedMcp].map((s) => new Promise((resolve) => s.close(resolve))),
  );
});

function callerToken(scope: string, sub = "user|1") {
  return mintAccessToken(key, {
    iss: tenant.issuer,
    aud: MCP_URL,
    sub,
    scope,
    claims: { client_id: "client-a" },
  });
}

async function callTool(
  name: string,
  token?: string,
  args: Record<string, unknown> = {},
  port: number = mcpPort,
) {
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

interface ToolResult {
  result?: { isError?: boolean; content: Array<{ text: string }> };
}

async function run(
  name: string,
  scope: string,
  sub: string,
  args: Record<string, unknown> = {},
) {
  const response = await callTool(name, await callerToken(scope, sub), args);
  expect(response.status).toBe(200);
  const body = (await response.json()) as ToolResult;
  return { text: body.result?.content[0]?.text ?? "", isError: body.result?.isError };
}

describe("example MCP server", () => {
  it("rejects a request without a credential", async () => {
    const response = await callTool("order_status_report");
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Bearer /);
  });

  it("serves its metadata at the suffixed route for GET and HEAD, leaves the root route to authentication, and the challenge names the route that serves it", async () => {
    const suffixed = await fetch(`http://127.0.0.1:${mcpPort}/.well-known/oauth-protected-resource/mcp`);
    const root = await fetch(`http://127.0.0.1:${mcpPort}/.well-known/oauth-protected-resource`);
    expect(suffixed.status).toBe(200);
    // The resource has a path, so the root URL does not stand for it: it goes through authentication.
    expect(root.status).toBe(401);
    const head = await fetch(`http://127.0.0.1:${mcpPort}/.well-known/oauth-protected-resource/mcp`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    const document = (await suffixed.json()) as {
      resource: string;
      authorization_servers: string[];
      scopes_supported?: string[];
    };
    expect(document.resource).toBe(MCP_URL);
    expect(document.authorization_servers).toEqual(["https://tenant.example.com/"]);
    // Clients ask for these, so a sign-in yields a token that can run the tools.
    expect(document.scopes_supported).toEqual([
      "tool:order_status_report",
      "tool:fulfill_order",
      "tool:sales_analytics_report",
    ]);

    const refused = await callTool("order_status_report");
    const advertised = /resource_metadata="([^"]+)"/.exec(refused.headers.get("www-authenticate") ?? "")?.[1];
    expect(advertised).toBe("https://mcp.example.com/.well-known/oauth-protected-resource/mcp");
  });

  it("sends the required scopes in the challenge for a request without a credential and keeps the tool scopes in the metadata", async () => {
    const refused = await callTool("order_status_report", undefined, {}, scopedMcpPort);
    const challenge = refused.headers.get("www-authenticate") ?? "";
    expect(refused.status).toBe(401);
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain('scope="store:read"');
    expect(challenge).toContain("resource_metadata=");

    const metadata = await fetch(`http://127.0.0.1:${scopedMcpPort}/.well-known/oauth-protected-resource/mcp`);
    expect(((await metadata.json()) as { scopes_supported?: string[] }).scopes_supported).toEqual([
      "tool:order_status_report",
      "tool:fulfill_order",
      "tool:sales_analytics_report",
    ]);
  });

  it("lists recent orders with two exchanged tokens", async () => {
    const out = await run("order_status_report", ALL_TOOLS, "user|status");

    expect(out.isError).toBeFalsy();
    expect(out.text).toContain("Recent orders for user|status:");
    expect(out.text).toContain("- ORD-1001 Wireless Headphones x1, shipped, stock left 24");
    expect(out.text).toContain("- ORD-1002 Mechanical Keyboard x1, processing, stock left 12");
    expect(out.text).toContain(`Orders (aud ${ORDERS}, scope read:orders`);
    expect(out.text).toContain(`Inventory (aud ${INVENTORY}, scope read:inventory`);
    expect(tenant.state.successfulExchangeCount).toBe(2);
    expect(
      tenant.state.requests.map((r) => r.params["audience"]).sort(),
    ).toEqual([INVENTORY, ORDERS]);
  });

  it("reuses saved tokens on a repeat lookup", async () => {
    await run("order_status_report", ALL_TOOLS, "user|repeat");
    expect(tenant.state.successfulExchangeCount).toBe(2);
    tenant.state.requests.length = 0;
    tenant.state.exchangeCount = 0;
    await run("order_status_report", ALL_TOOLS, "user|repeat");
    expect(tenant.state.exchangeCount).toBe(0);
  });

  it("reuses the Orders token when fulfilling right after a status report", async () => {
    await run("order_status_report", ALL_TOOLS, "user|reuse");
    tenant.state.exchangeCount = 0;
    await run("fulfill_order", ALL_TOOLS, "user|reuse", { order_id: "ORD-1001" });
    // Only the Inventory write token is new.
    expect(tenant.state.exchangeCount).toBe(1);
    expect(tenant.state.lastExchangeRequest?.params["audience"]).toBe(INVENTORY);
  });

  it("shows one order, and reports an unknown one", async () => {
    const one = await run("order_status_report", ALL_TOOLS, "user|one", {
      order_id: "ORD-1003",
    });
    expect(one.text).toContain("Status of ORD-1003 for user|one:");
    expect(one.text).not.toContain("ORD-1001");

    const missing = await run("order_status_report", ALL_TOOLS, "user|one", {
      order_id: "ORD-9999",
    });
    expect(missing.isError).toBe(true);
    expect(missing.text).toBe("Order ORD-9999 was not found.");
  });

  it("does not show or fulfill an order of another shopper", async () => {
    const shown = await run("order_status_report", ALL_TOOLS, "user|nosy", { order_id: "ORD-9001" });
    expect(shown.isError).toBe(true);
    expect(shown.text).toBe("Order ORD-9001 was not found.");

    const fulfilled = await run("fulfill_order", ALL_TOOLS, "user|nosy", { order_id: "ORD-9001" });
    expect(fulfilled.isError).toBe(true);
    expect(fulfilled.text).toBe("Order ORD-9001 was not found.");

    const report = await run("order_status_report", ALL_TOOLS, "user|nosy");
    expect(report.text).not.toContain("ORD-9001");
  });

  it("fulfills an order once and changes stock", async () => {
    const first = await run("fulfill_order", ALL_TOOLS, "user|fulfill", {
      order_id: "ORD-1002",
    });
    expect(first.isError).toBeFalsy();
    expect(first.text).toContain(
      "Order ORD-1002 fulfilled: reserved 1 x Mechanical Keyboard (stock 12 -> 11)",
    );
    expect(first.text).toContain(`Inventory (aud ${INVENTORY}, scope write:inventory`);

    const again = await run("fulfill_order", ALL_TOOLS, "user|fulfill", {
      order_id: "ORD-1002",
    });
    expect(again.text).toContain(
      "Order ORD-1002 was already fulfilled (stock stays 11)",
    );

    const report = await run("order_status_report", ALL_TOOLS, "user|fulfill");
    expect(report.text).toContain("ORD-1002 Mechanical Keyboard x1, processing, stock left 11");
  });

  it("fetches sales numbers with the server's own token", async () => {
    const out = await run("sales_analytics_report", ALL_TOOLS, "user|sales");

    expect(out.text).toContain("Monthly revenue: $142,000 | Top product: Enterprise Suite");
    expect(out.text).toContain(
      `Checked by: Analytics (aud ${ANALYTICS}, scope read:analytics, service token for the server itself)`,
    );
    expect(tenant.state.clientCredentialsCount).toBe(1);
    expect(tenant.state.successfulExchangeCount).toBe(0);
  });

  it("denies a tool per tool, with HTTP 200 and an error result", async () => {
    const denied = await run(
      "sales_analytics_report",
      "openid tool:order_status_report",
      "user|limited",
    );
    expect(denied.isError).toBe(true);
    expect(tenant.state.clientCredentialsCount).toBe(0);

    const allowed = await run(
      "order_status_report",
      "openid tool:order_status_report",
      "user|limited",
    );
    expect(allowed.isError).toBeFalsy();
  });

  describe("a caller who holds only the scopes of the other tools", () => {
    const tools = [
      ["order_status_report", {}, "tool:order_status_report"],
      ["fulfill_order", { order_id: "ORD-1001" }, "tool:fulfill_order"],
      ["sales_analytics_report", {}, "tool:sales_analytics_report"],
    ] as const;

    it.each(tools)("is refused by %s before any token request", async (name, args, own) => {
      const others = tools.map(([, , scope]) => scope).filter((scope) => scope !== own);

      const out = await run(name, `openid ${others.join(" ")}`, `user|without-${name}`, args);

      expect(out.isError).toBe(true);
      expect(out.text).toBe("Missing one or more required scopes.");
      expect(tenant.state.exchangeCount).toBe(0);
      expect(tenant.state.clientCredentialsCount).toBe(0);
    });
  });

  describe("a store API that fails with a body", () => {
    it.each([
      ["order_status_report", {}],
      ["fulfill_order", { order_id: "ORD-1001" }],
      ["sales_analytics_report", {}],
    ] as const)("%s returns a fixed message and none of the upstream text", async (name, args) => {
      const response = await callTool(name, await callerToken(ALL_TOOLS, `user|upstream-${name}`), args, failingMcpPort);
      const raw = await response.text();
      const body = JSON.parse(raw) as ToolResult;

      expect(response.status).toBe(200);
      expect(body.result?.isError).toBe(true);
      expect(body.result?.content[0]?.text).toBe("The store API answered 502.");
      expect(raw).not.toContain(UPSTREAM_SECRET);
      expect(raw).not.toContain("internal.example.com");
    });
  });

  it("never returns exchange error text in the tool result", async () => {
    tenant.state.failure = {
      status: 400,
      body: {
        error: "invalid_grant",
        error_description: "SECRET-INTERNAL-DETAIL tenant.example.com",
      },
    };
    // A caller no earlier test used, so a cached exchange cannot hide the failure.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await callTool(
      "order_status_report",
      await callerToken(ALL_TOOLS, "user|failing"),
    );
    const raw = await response.text();
    const logLines = logged.mock.calls.map((call) => call.join(" "));
    logged.mockRestore();
    const body = JSON.parse(raw) as ToolResult;

    expect(body.result?.isError).toBe(true);
    expect(body.result?.content[0]?.text).toBe("Could not reach the store API.");
    expect(raw).not.toContain("SECRET-INTERNAL-DETAIL");
    expect(raw).not.toContain("invalid_grant");

    // The server log keeps what the tool result hides: the class, and the tenant's own answer.
    expect(logLines).toHaveLength(1);
    expect(logLines[0]).toContain("order_status_report failed TokenExchangeError");
    expect(logLines[0]).toContain("invalid_grant");
    expect(logLines[0]).toContain("SECRET-INTERNAL-DETAIL");
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
