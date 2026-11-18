import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer as createNetServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo, Socket } from "node:net";
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
import type { Auth0Session, FastMcpAuth } from "@auth0/ai-fastmcp";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/auth.js";
import type { AppConfig, OrdersApiConfig } from "../src/config.js";
import { createOrdersServer } from "../src/orders-api.js";

// Offline: Auth0 is replaced by MSW handlers; both servers listen on loopback.

/** The platform `fetch`, captured before MSW patches the global one. The tests talk to the servers through it. */
const socketFetch: typeof fetch = globalThis.fetch;

const DOMAIN = "tenant.example.com";
const ORDERS = "https://orders.example.com";
const ALL_TOOLS = "openid tool:cancel_order";
const silentLogger = { debug() {}, error() {}, info() {}, log() {}, warn() {} };

let key: TestKey;
let tenant: ReturnType<typeof createAuth0Handlers>;
let ordersApi: HttpServer;
let ordersPort: number;
let ordersConfig: OrdersApiConfig;
let mcpPort: number;
let mcpUrl: string;
let app: StartedApp;

interface StartedApp {
  server: FastMCP<Auth0Session>;
  port: number;
  url: string;
  stop(): Promise<void>;
}

const msw = setupServer();

function listen(server: HttpServer): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port));
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

/**
 * Starts the MCP server of the example on a free port. The example reads the Auth0 settings of the
 * MCP server from the environment, so they are set while `createApp` runs.
 */
async function startApp(
  overrides: Partial<AppConfig> = {},
  ordersApiUrl = `http://127.0.0.1:${ordersPort}`,
  routePath = "/mcp",
): Promise<StartedApp> {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}${routePath}`;
  const config: AppConfig = {
    requiredScopes: [],
    ordersAudience: ORDERS,
    ordersApiUrl,
    downstreamTimeoutMs: 2000,
    port,
    ...overrides,
  };
  const names = ["AUTH0_DOMAIN", "AUTH0_AUDIENCE", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET"];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    AUTH0_DOMAIN: DOMAIN,
    AUTH0_AUDIENCE: url,
    AUTH0_CLIENT_ID: "mcp-client",
    AUTH0_CLIENT_SECRET: "secret",
  });
  let server: FastMCP<Auth0Session>;
  let auth: FastMcpAuth;
  try {
    auth = createAuth(config);
    server = createApp(config, { auth, logger: silentLogger });
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
  // The same wiring as src/server.ts and the README: the route comes from the audience through auth.endpoint.
  await server.start({
    transportType: "httpStream",
    httpStream: { endpoint: auth.endpoint, port, host: "127.0.0.1", stateless: true },
  });
  return { server, port, url, stop: () => server.stop() };
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

  app = await startApp();
  mcpPort = app.port;
  mcpUrl = app.url;
});

afterEach(() => tenant.state.reset());
afterAll(async () => {
  msw.close();
  await app.stop();
  await new Promise((resolve) => ordersApi.close(resolve));
});

function callerToken(scope: string, sub = "user|1", aud = mcpUrl) {
  return mintAccessToken(key, {
    iss: tenant.issuer,
    aud,
    sub,
    scope,
    claims: { azp: "client-a" },
  });
}

function post(body: unknown, token?: string, url = mcpUrl) {
  return socketFetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token && { authorization: `Bearer ${token}` }),
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
  result?: { isError?: boolean; content: Array<{ text: string }>; _meta?: Record<string, unknown> };
}

async function callTool(name: string, token?: string, args: Record<string, unknown> = {}, url = mcpUrl) {
  return post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, token, url);
}

async function run(name: string, scope: string, sub: string, args: Record<string, unknown> = {}, token?: string) {
  const response = await callTool(name, token ?? (await callerToken(scope, sub)), args);
  expect(response.status).toBe(200);
  const body = messageOf(await response.text()) as ToolResult;
  return { text: body.result?.content[0]?.text ?? "", isError: body.result?.isError, meta: body.result?._meta };
}

describe("example MCP server", () => {
  it("rejects a request without a credential", async () => {
    const response = await callTool("whoami");
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Bearer /);
  });

  it("serves its metadata at both routes, and the challenge names a route that serves it", async () => {
    const suffixed = await socketFetch(`http://127.0.0.1:${mcpPort}/.well-known/oauth-protected-resource/mcp`);
    const root = await socketFetch(`http://127.0.0.1:${mcpPort}/.well-known/oauth-protected-resource`);
    expect(suffixed.status).toBe(200);
    expect(root.status).toBe(200);
    const document = (await suffixed.json()) as {
      resource: string;
      authorization_servers: string[];
      resource_name?: string;
    };
    expect(document.resource).toBe(mcpUrl);
    expect(document.authorization_servers).toEqual([`https://${DOMAIN}/`]);
    expect(document.resource_name).toBe("Orders example");
    expect(await root.json()).toEqual(document);

    const refused = await callTool("whoami");
    const advertised = /resource_metadata="([^"]+)"/.exec(refused.headers.get("www-authenticate") ?? "")?.[1];
    expect(advertised).toBe(`http://127.0.0.1:${mcpPort}/.well-known/oauth-protected-resource/mcp`);
  });

  it("lists the three tools", async () => {
    const response = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, await callerToken("openid"));
    const body = messageOf(await response.text()) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((tool) => tool.name).sort()).toEqual(["cancel_order", "list_orders", "whoami"]);
  });

  it("tells the caller who they are, with no scope beyond a valid token", async () => {
    const out = await run("whoami", "openid read:something", "user|who");
    expect(out.isError).toBeFalsy();
    expect(out.text).toBe("Signed in as user|who\nClient: client-a\nScopes: openid read:something");
    expect(tenant.state.exchangeCount).toBe(0);
  });

  it("lists the orders with one exchanged token and shows what the orders API checked", async () => {
    const out = await run("list_orders", "openid", "user|lister");

    expect(out.isError).toBeFalsy();
    expect(out.text).toContain("Orders of user|lister:");
    expect(out.text).toContain("- ord_1001 Wireless Headphones x1, shipped");
    expect(out.text).toContain("- ord_1002 Mechanical Keyboard x1, processing");
    expect(out.text).toContain(`Checked by the orders API: aud ${ORDERS}, scope read:orders, acting client`);
    expect(tenant.state.successfulExchangeCount).toBe(1);
    expect(tenant.state.lastExchangeRequest?.params["audience"]).toBe(ORDERS);
  });

  it("reuses the saved token on a repeat call by the same caller", async () => {
    // One access token for both calls. A new token, even for the same user, is a new session.
    const token = await callerToken("openid", "user|repeat");
    await run("list_orders", "openid", "user|repeat", {}, token);
    expect(tenant.state.exchangeCount).toBe(1);
    await run("list_orders", "openid", "user|repeat", {}, token);
    expect(tenant.state.exchangeCount).toBe(1);
    await run("list_orders", "openid", "user|someone-else");
    expect(tenant.state.exchangeCount).toBe(2);
  });

  it("denies cancel_order without its scope, with HTTP 200 and an error result, before any exchange", async () => {
    const denied = await run("cancel_order", "openid", "user|limited", { order_id: "ord_1002" });
    expect(denied.isError).toBe(true);
    expect(denied.text).toBe("Missing required scope: tool:cancel_order");
    expect(denied.meta).toEqual({ error: "insufficient_scope" });
    expect(tenant.state.exchangeCount).toBe(0);

    const allowed = await run("list_orders", "openid", "user|limited");
    expect(allowed.isError).toBeFalsy();
  });

  it("cancels an order that has not shipped, once, with a write token", async () => {
    const first = await run("cancel_order", ALL_TOOLS, "user|cancel", { order_id: "ord_1003" });
    expect(first.isError).toBeFalsy();
    expect(first.text).toContain("Order ord_1003 cancelled");
    expect(first.text).toContain(`aud ${ORDERS}, scope write:orders, acting client`);
    expect(tenant.state.lastExchangeRequest?.params["scope"]).toBe("write:orders");

    const again = await run("cancel_order", ALL_TOOLS, "user|cancel", { order_id: "ord_1003" });
    expect(again.text).toContain("Order ord_1003 was already cancelled");

    const list = await run("list_orders", ALL_TOOLS, "user|cancel");
    expect(list.text).toContain("- ord_1003 USB-C Dock x2, cancelled");
  });

  it("keeps the orders of each caller apart: a cancellation by one caller changes nothing for another", async () => {
    const alice = await run("cancel_order", ALL_TOOLS, "user|alice", { order_id: "ord_1003" });
    expect(alice.text).toContain("Order ord_1003 cancelled");

    const bob = await run("list_orders", ALL_TOOLS, "user|bob");
    expect(bob.text).toContain("Orders of user|bob:");
    expect(bob.text).toContain("- ord_1003 USB-C Dock x2, processing");
    const aliceList = await run("list_orders", ALL_TOOLS, "user|alice");
    expect(aliceList.text).toContain("- ord_1003 USB-C Dock x2, cancelled");
  });

  it("does not let a caller see or cancel an order of another shopper", async () => {
    const list = await run("list_orders", ALL_TOOLS, "user|snoop");
    expect(list.text).not.toContain("ord_9001");

    const cancel = await run("cancel_order", ALL_TOOLS, "user|snoop", { order_id: "ord_9001" });
    expect(cancel.isError).toBe(true);
    expect(cancel.text).toBe("Order ord_9001 was not found.");
  });

  it("refuses to cancel a shipped order and reports an unknown order", async () => {
    const shipped = await run("cancel_order", ALL_TOOLS, "user|refuse", { order_id: "ord_1001" });
    expect(shipped.isError).toBe(true);
    expect(shipped.text).toBe("Order ord_1001 has shipped and cannot be cancelled.");

    const missing = await run("cancel_order", ALL_TOOLS, "user|refuse", { order_id: "ord_9999" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toBe("Order ord_9999 was not found.");
  });

  it("never returns exchange error text in the tool result", async () => {
    tenant.state.failure = {
      status: 400,
      body: { error: "invalid_grant", error_description: "SECRET-INTERNAL-DETAIL tenant.example.com" },
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // A caller no earlier test used, so a saved token cannot hide the failure.
      const response = await callTool("list_orders", await callerToken("openid", "user|failing"));
      const raw = await response.text();
      const body = messageOf(raw) as ToolResult;

      expect(body.result?.isError).toBe(true);
      expect(body.result?.content[0]?.text).toBe("Tool execution failed.");
      expect(raw).not.toContain("SECRET-INTERNAL-DETAIL");
      expect(raw).not.toContain("invalid_grant");
      // The wrapper writes one line to the server log: the error name, and what Auth0 returned.
      expect(log).toHaveBeenCalledTimes(1);
      const line = String(log.mock.calls[0]?.[0]);
      expect(line).toMatch(/^\[ai-fastmcp\] Tool failed: \w+/);
      expect(line).toContain("auth0_error=invalid_grant");
      expect(line).not.toMatch(/Bearer|\bsecret\b/);
    } finally {
      log.mockRestore();
    }
  });

  it("stops waiting for the orders API after DOWNSTREAM_TIMEOUT_MS", async () => {
    // A server that accepts connections and never answers.
    const sockets = new Set<Socket>();
    const silent = createNetServer((socket) => {
      sockets.add(socket);
      socket.on("error", () => {});
    });
    const silentPort = await new Promise<number>((resolve) => {
      silent.listen(0, "127.0.0.1", () => resolve((silent.address() as AddressInfo).port));
    });
    const impatient = await startApp({ downstreamTimeoutMs: 200 }, `http://127.0.0.1:${silentPort}`);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const started = Date.now();
      const response = await callTool("list_orders", await callerToken("openid", "user|slow", impatient.url), {}, impatient.url);
      const body = messageOf(await response.text()) as ToolResult;
      expect(body.result?.isError).toBe(true);
      expect(body.result?.content[0]?.text).toBe("Tool execution failed.");
      expect(Date.now() - started).toBeLessThan(1800);
      expect(String(log.mock.calls[0]?.[0])).toMatch(/^\[ai-fastmcp\] Tool failed: (TimeoutError|AbortError)/);
    } finally {
      log.mockRestore();
      await impatient.stop();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => silent.close(resolve));
    }
  });

  it("keeps the path of ORDERS_API_URL when it calls the orders API, with or without a trailing slash", async () => {
    // An orders API that lives under a path, and records the paths it is asked for.
    const seen: string[] = [];
    const behindPath = createHttpServer((req, res) => {
      seen.push(`${req.method} ${req.url}`);
      const verified = { audience: ORDERS, scope: "read:orders", actor: null, subject: "user|path" };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(req.method === "GET" ? { orders: [], verified } : { result: "cancelled", verified }));
    });
    const apiPort = await listen(behindPath);
    try {
      for (const base of [`http://127.0.0.1:${apiPort}/api/v1`, `http://127.0.0.1:${apiPort}/api/v1/`]) {
        seen.length = 0;
        const withPath = await startApp({}, base);
        try {
          const list = await callTool("list_orders", await callerToken(ALL_TOOLS, "user|path", withPath.url), {}, withPath.url);
          expect(((messageOf(await list.text()) as ToolResult).result?.isError)).toBeFalsy();
          const cancel = await callTool(
            "cancel_order",
            await callerToken(ALL_TOOLS, "user|path", withPath.url),
            { order_id: "ord 2" },
            withPath.url,
          );
          expect(((messageOf(await cancel.text()) as ToolResult).result?.isError)).toBeFalsy();
          expect(seen).toEqual(["GET /api/v1/orders", "POST /api/v1/orders/ord%202/cancel"]);
        } finally {
          await withPath.stop();
        }
      }
    } finally {
      await new Promise((resolve) => behindPath.close(resolve));
    }
  });

  it("publishes the scope of cancel_order, which only that tool checks, as scopes_supported", async () => {
    const metadata = await socketFetch(`http://127.0.0.1:${mcpPort}/.well-known/oauth-protected-resource/mcp`);
    expect(((await metadata.json()) as { scopes_supported?: string[] }).scopes_supported).toEqual(["tool:cancel_order"]);
  });

  it("serves the route and the metadata at the path of an audience that is not /mcp", async () => {
    const custom = await startApp({}, undefined, "/api/orders-mcp");
    try {
      const origin = new URL(custom.url).origin;
      const refused = await callTool("whoami", undefined, {}, custom.url);
      expect(refused.status).toBe(401);
      const advertised = /resource_metadata="([^"]+)"/.exec(refused.headers.get("www-authenticate") ?? "")?.[1];
      expect(advertised).toBe(`${origin}/.well-known/oauth-protected-resource/api/orders-mcp`);
      expect((await socketFetch(advertised!)).status).toBe(200);

      const out = await callTool("whoami", await callerToken("openid", "user|path", custom.url), {}, custom.url);
      expect(out.status).toBe(200);
      expect(((messageOf(await out.text()) as ToolResult).result?.content[0]?.text) ?? "").toContain("Signed in as user|path");
      // FastMCP's default route is not served.
      expect((await callTool("whoami", undefined, {}, `${origin}/mcp`)).status).toBe(404);
    } finally {
      await custom.stop();
    }
  });

  it("applies MCP_REQUIRED_SCOPES to every request before any tool runs", async () => {
    const gated = await startApp({ requiredScopes: ["mcp:access"] });
    try {
      const without = await callTool("whoami", await callerToken("openid", "user|gate", gated.url), {}, gated.url);
      expect(without.status).toBe(403);
      expect(without.headers.get("www-authenticate")).toContain('scope="mcp:access"');
      const withScope = await callTool("whoami", await callerToken("openid mcp:access", "user|gate", gated.url), {}, gated.url);
      expect(withScope.status).toBe(200);
      const anonymous = await callTool("whoami", undefined, {}, gated.url);
      expect(anonymous.status).toBe(401);
      expect(anonymous.headers.get("www-authenticate")).toContain('scope="mcp:access"');
      const metadata = await socketFetch(`${new URL(gated.url).origin}/.well-known/oauth-protected-resource/mcp`);
      expect(((await metadata.json()) as { scopes_supported?: string[] }).scopes_supported).toEqual([
        "mcp:access",
        "tool:cancel_order",
      ]);
    } finally {
      await gated.stop();
    }
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
