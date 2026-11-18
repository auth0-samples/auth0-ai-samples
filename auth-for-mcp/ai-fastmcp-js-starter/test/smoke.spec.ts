import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer as createNetServer } from "node:net";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { FastMCP } from "fastmcp";
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
import { createApp } from "../src/app.js";
import type { AppConfig, OrdersApiConfig } from "../src/config.js";
import { createOrdersServer } from "../src/orders-api.js";

// Offline: Auth0 is replaced by MSW handlers; both servers listen on loopback.

/** The platform `fetch`, captured before MSW patches the global one. The tests talk to the servers through it. */
const socketFetch: typeof fetch = globalThis.fetch;

const DOMAIN = "tenant.example.com";
const ORDERS = "https://orders.example.com";
const silentLogger = { debug() {}, error() {}, info() {}, log() {}, warn() {} };

let key: TestKey;
let tenant: ReturnType<typeof createAuth0Handlers>;
let ordersApi: HttpServer;
let ordersPort: number;
let ordersConfig: OrdersApiConfig;
let mcpUrl: string;
let server: FastMCP;

const msw = setupServer();

function listen(s: HttpServer): Promise<number> {
  return new Promise((resolve) => {
    s.listen(0, "127.0.0.1", () => resolve((s.address() as AddressInfo).port));
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  key = await createTestKey();
  tenant = createAuth0Handlers({ key, domain: DOMAIN, scope: scopeMode.echo });
  msw.listen({
    onUnhandledRequest(request, print) {
      if (new URL(request.url).hostname === "127.0.0.1") return;
      print.error();
    },
  });
  // The handlers come from the package test support, which may resolve its own copy of msw.
  msw.use(...(tenant.handlers as unknown as Parameters<typeof msw.use>));

  ordersConfig = { domain: DOMAIN, ordersAudience: ORDERS, port: 0 };
  ordersApi = createOrdersServer(ordersConfig, createLocalJWKSet(exportJwks(key) as Parameters<typeof createLocalJWKSet>[0]));
  ordersPort = await listen(ordersApi);

  const port = await freePort();
  mcpUrl = `http://127.0.0.1:${port}/mcp`;
  const config: AppConfig = {
    requiredScopes: [],
    ordersAudience: ORDERS,
    ordersApiUrl: `http://127.0.0.1:${ordersPort}`,
    downstreamTimeoutMs: 2000,
    port,
  };
  server = createApp(config, { logger: silentLogger });
  await server.start({
    transportType: "httpStream",
    httpStream: { endpoint: "/mcp", port, host: "127.0.0.1", stateless: true },
  });
});

afterEach(() => tenant.state.reset());
afterAll(async () => {
  msw.close();
  await server.stop();
  await new Promise((resolve) => ordersApi.close(resolve));
});

function post(body: unknown) {
  return socketFetch(mcpUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
}

/** The last JSON message of a response that is plain JSON or a server-sent event stream. */
function messageOf(body: string): unknown {
  const events = [...body.matchAll(/^data: (.*)$/gm)].map((match) => match[1]!).filter((data) => data.trim() !== "");
  return JSON.parse(events.length > 0 ? events[events.length - 1]! : body);
}

interface ToolResult {
  result?: { isError?: boolean; content: Array<{ text: string }> };
}

async function run(name: string, args: Record<string, unknown> = {}) {
  const response = await post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  expect(response.status).toBe(200);
  const body = messageOf(await response.text()) as ToolResult;
  return { text: body.result?.content[0]?.text ?? "", isError: body.result?.isError };
}

// The starter has no authentication yet: these tests describe the server before the quickstart.
describe("starter MCP server (no authentication)", () => {
  it("answers a request without a credential and lists the three tools", async () => {
    const response = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(response.status).toBe(200);
    const body = messageOf(await response.text()) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((tool) => tool.name).sort()).toEqual(["cancel_order", "list_orders", "whoami"]);
  });

  it("describes the demo shopper", async () => {
    const out = await run("whoami");
    expect(out.text).toBe("Signed in as demo-shopper (no authentication yet)");
  });

  it("lists the orders of the demo shopper", async () => {
    const out = await run("list_orders");
    expect(out.isError).toBeFalsy();
    expect(out.text).toContain("Orders of demo-shopper:");
    expect(out.text).toContain("- ord_1002 Mechanical Keyboard x1, processing");
  });

  it("cancels an order once, refuses a shipped one and reports an unknown one", async () => {
    expect((await run("cancel_order", { order_id: "ord_1002" })).text).toBe("Order ord_1002 cancelled");
    expect((await run("cancel_order", { order_id: "ord_1002" })).text).toBe("Order ord_1002 was already cancelled");
    const shipped = await run("cancel_order", { order_id: "ord_1001" });
    expect(shipped.isError).toBe(true);
    expect(shipped.text).toContain("has shipped and cannot be cancelled");
    const unknown = await run("cancel_order", { order_id: "ord_9001" });
    expect(unknown.isError).toBe(true);
    expect(unknown.text).toContain("was not found");
  });
});

describe("example orders API", () => {
  function get(path: string, token?: string) {
    return socketFetch(`http://127.0.0.1:${ordersPort}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  function mint(aud: string, scope: string, extra: { sub?: string; exp?: number } = {}) {
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

  it("answers 401 for a token issued for another API", async () => {
    expect((await get("/orders", await mint("https://inventory.example.com", "read:orders"))).status).toBe(401);
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
    expect(body.verified).toMatchObject({ audience: ORDERS, scope: "read:orders", subject: "user|1" });
  });

  it("names the acting client of an exchanged token in the proof", async () => {
    const token = await mintAccessToken(key, {
      iss: tenant.issuer,
      aud: ORDERS,
      sub: "user|1",
      scope: "read:orders",
      claims: { act: { sub: "exchange-client" } },
    });
    const body = (await (await get("/orders", token)).json()) as { verified: { actor: string | null } };
    expect(body.verified.actor).toBe("exchange-client");
    const plain = (await (await get("/orders", await mint(ORDERS, "read:orders"))).json()) as { verified: { actor: string | null } };
    expect(plain.verified.actor).toBeNull();
  });

  it("needs the write scope to cancel, and answers 404 for an unknown route", async () => {
    const cancel = (token: string) =>
      socketFetch(`http://127.0.0.1:${ordersPort}/orders/ord_1002/cancel`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
    expect((await cancel(await mint(ORDERS, "read:orders"))).status).toBe(403);
    expect((await get("/nothing", await mint(ORDERS, "read:orders"))).status).toBe(404);
  });

  it("returns only the orders of the caller and answers 404 when the caller cancels an order of someone else", async () => {
    const post = (path: string, token: string) =>
      socketFetch(`http://127.0.0.1:${ordersPort}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    const orderIds = async (sub: string) => {
      const res = await get("/orders", await mint(ORDERS, "read:orders", { sub }));
      return ((await res.json()) as { orders: Array<{ id: string; customer: string }> }).orders;
    };

    const carol = await orderIds("user|carol");
    expect(carol.map((order) => order.id)).toEqual(["ord_1001", "ord_1002", "ord_1003"]);
    expect(new Set(carol.map((order) => order.customer))).toEqual(new Set(["user|carol"]));

    const write = await mint(ORDERS, "write:orders", { sub: "user|dave" });
    expect((await post("/orders/ord_9001/cancel", write)).status).toBe(404);
    expect((await post("/orders/ord_1002/cancel", write)).status).toBe(200);
    // Dave's cancellation is not visible to Carol.
    expect((await orderIds("user|carol")).find((order) => order.id === "ord_1002")).toMatchObject({ status: "processing" });
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
    const token = await mint(ORDERS, "read:orders", { exp: Math.floor(Date.now() / 1000) - 3600 });
    expect((await get("/orders", token)).status).toBe(401);
  });
});
