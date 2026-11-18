/**
 * Offline smoke check: starts the server on a free port with placeholder settings and checks
 * that a request without a token is challenged and that the protected resource metadata is
 * served. It makes no call to Auth0.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

process.env.AUTH0_DOMAIN = "your-tenant.us.auth0.com";
process.env.AUTH0_AUDIENCE = "http://localhost:3001/mcp";

const { createExpressApp } = await import("../src/server.js");

const server = createExpressApp().listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

try {
  const challenge = await fetch(`${base}/mcp`, { method: "POST" });
  assert.equal(challenge.status, 401, "a request without a token must be challenged");
  const header = challenge.headers.get("www-authenticate") ?? "";
  assert.match(header, /resource_metadata=/, "the challenge must name the metadata URL");

  const metadata = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
  assert.equal(metadata.status, 200);
  const body = (await metadata.json()) as { resource?: string; authorization_servers?: string[] };
  assert.equal(body.resource, "http://localhost:3001/mcp");
  assert.deepEqual(body.authorization_servers, ["https://your-tenant.us.auth0.com/"]);

  console.log("smoke ok");
} finally {
  server.close();
  server.closeAllConnections();
}
