/**
 * Offline smoke check: starts the server on a free port with placeholder settings and checks
 * that a request without a token is challenged and that the protected resource metadata is
 * served. It makes no call to Auth0.
 */
import assert from "node:assert/strict";
import { createServer as createNetServer } from "node:net";
import type { AddressInfo } from "node:net";

process.env.AUTH0_DOMAIN = "your-tenant.us.auth0.com";
process.env.AUTH0_AUDIENCE = "http://localhost:3001/mcp";

const { createServer } = await import("../src/server.js");

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

const port = await freePort();
const { server, endpoint } = createServer();
await server.start({ transportType: "httpStream", httpStream: { port, endpoint, stateless: true } });
const base = `http://localhost:${port}`;

try {
  const challenge = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(challenge.status, 401, "a request without a token must be challenged");
  const header = challenge.headers.get("www-authenticate") ?? "";
  assert.match(header, /resource_metadata=/, "the challenge must name the metadata URL");

  const metadata = await fetch(`${base}/.well-known/oauth-protected-resource${endpoint}`);
  assert.equal(metadata.status, 200);
  const body = (await metadata.json()) as { resource?: string; authorization_servers?: string[] };
  assert.equal(body.resource, "http://localhost:3001/mcp");
  assert.deepEqual(body.authorization_servers, ["https://your-tenant.us.auth0.com/"]);

  console.log("smoke ok");
} finally {
  await server.stop();
}
process.exit(0);
