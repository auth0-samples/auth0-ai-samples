# Orders MCP server on FastMCP, starter (`@auth0/ai-fastmcp` quickstart)

> **This is the starter.** It is the orders MCP server from [`ai-fastmcp-js`](../ai-fastmcp-js) without the Auth0 MCP SDK wiring, so it accepts every request. The finished version, with token verification, scopes and token delegation, is the sibling directory [`ai-fastmcp-js`](../ai-fastmcp-js). Follow the quickstart to turn this one into that one.

The starter already has the parts that do not depend on Auth0:

- `src/config.ts` reads the settings from the environment.
- `src/app.ts` builds the FastMCP server and `src/server.ts` starts it in the stateless HTTP mode.
- `src/tools.ts` registers the three tools (`whoami`, `list_orders`, `cancel_order`). The tools read the in-memory orders as one fixed demo shopper, and nothing checks who calls.
- `src/orders-api.ts` and `src/orders-data.ts` play the orders API. The orders API verifies every token it receives against your tenant.
- `test/` has the offline tests for the server as it is now and for the orders API.

Search for `Quickstart:` to find every place the quickstart changes. Each comment names the change and sits where it goes:

```sh
grep -rn "Quickstart:" src
```

## Run

Node.js 20 or later is required.

```sh
git clone https://github.com/auth0-samples/auth0-ai-samples.git
cd auth0-ai-samples/auth-for-mcp/ai-fastmcp-js-starter
npm install
cp .env.example .env
npm run start          # MCP server on port 3002
```

Expected output: `MCP server listening on port 3002 at /mcp`. Any request is answered, with no token:

```sh
curl -s -X POST http://localhost:3002/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The starter does not need a tenant to run. `npm run start:api` starts the orders API, which needs `AUTH0_DOMAIN` and `ORDERS_AUDIENCE`, and only matters once the tools call it.

## Check

```sh
npm run type-check
npm run lint
npm run build
npm test
```

`npm test` runs offline on loopback with a mocked Auth0 tenant. The sample pins `@auth0/ai-fastmcp` and `@auth0/ai-mcp` to the exact beta release `1.0.0-beta.1`, so `npm install` needs that release to be available on your registry. The starter code does not import them yet.

For the tenant setup and the finished server, see the [`ai-fastmcp-js` README](../ai-fastmcp-js/README.md).
