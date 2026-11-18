# Orders MCP server on FastMCP with Auth0 token delegation (`@auth0/ai-fastmcp`)

A small MCP server built with FastMCP and `@auth0/ai-fastmcp`. It plays an order assistant. It checks the access token on every request, then calls an orders API as the signed-in shopper (an on-behalf-of token exchange). A second small process plays the orders API and verifies every token it receives.

## What it shows

- `src/auth.ts` holds all the Auth0 wiring: one `createFastMcpAuth` call with a token store. The tenant settings come from the environment (`AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID` and `AUTH0_CLIENT_SECRET`), so the call passes none of them. `src/app.ts` spreads the two options it returns into `new FastMCP({...})`, and `src/tools.ts` holds only the tools. The route comes from the audience: `auth.endpoint` is its path, and `src/server.ts` passes it to `server.start`, so the path appears once. The server runs in the stateless HTTP mode. A request without a valid token gets a `WWW-Authenticate` challenge before any tool runs, and the server publishes its protected resource metadata (RFC 9728).
- `whoami` needs no scope beyond a valid token. It reports the subject, the client and the scopes of the caller.
- `list_orders` exchanges the caller's token for a token to the orders API with the `read:orders` scope, through `getCallerMcpClientOrThrow()`, and lists the orders. A second call with the same access token reuses the saved token.
- `cancel_order` (required argument `order_id`) needs the scope `tool:cancel_order`, set with `requiredScopes` on `withAuth0Execute`. A scope that only one tool checks is not published on its own, so `src/auth.ts` lists it in `metadata.scopesSupported` and an OAuth client asks for it when it signs in. A caller without it gets an error result for that tool only (HTTP 200) and no exchange takes place. With the scope, the tool exchanges for a token with `write:orders`, through `session.mcpClient`, and cancels the order.
- Only the exchanged token goes to the orders API, never the caller's own token. Expected failures, such as an unknown order, reach the caller as a `UserError` with a fixed message. Anything unexpected becomes `Tool execution failed.`, and the wrapper writes one line to the server log with the error name, its code and status, and the `error` and `error_description` Auth0 returned, never the message of the error. Each call stops after `DOWNSTREAM_TIMEOUT_MS`.
- `src/orders-api.ts` verifies every token (RS256 signature from the tenant JWKS, issuer, the audience of the orders API, expiry, subject and scope) before it returns data. Each answer includes a `verified` block that names the audience, the scope and the acting client of the token if it carries an `act` claim, never the token itself.

Seed data lives in memory and resets on restart. Each shopper gets their own three starter orders the first time they ask: ord_1001 (shipped), ord_1002 and ord_1003 (processing). The orders API returns and cancels only the orders of the caller, whose subject comes from the verified token. A fourth order, ord_9001, belongs to another shopper, so asking to cancel it answers "not found".

## Set up your tenant

On-behalf-of token exchange must be enabled on your tenant. Enabling it may require Auth0 support. The exchange client must be a Custom API client tied to the MCP API: with a regular application Auth0 answers HTTP 400 `invalid_request` with `Client must be a Custom API Client with resource_server_id`. Other causes of a rejected exchange are a subject token issued for another API than the one of the exchange client, a downstream API that does not allow skipping user consent for verifiable first-party clients, and a missing client grant. The tool then answers only `Tool execution failed.`, so read the reason in the server log and in the tenant logs (Dashboard, Monitoring, Logs). The commands use the [Auth0 CLI](https://github.com/auth0/auth0-cli). Replace each `YOUR_...` with the id from the previous command's output.

```bash
auth0 login --scopes create:client_grants,update:connections
# 1. APIs: the MCP server (identifier = AUTH0_AUDIENCE) and the orders service
auth0 apis create --name "Orders MCP (FastMCP)" --identifier "http://localhost:3002/mcp" --signing-alg RS256 \
  --scopes "tool:cancel_order"
auth0 apis create --name "Orders Service (FastMCP)" --identifier "https://fastmcp-orders.api/" --signing-alg RS256 \
  --scopes "read:orders,write:orders"
# 2. Exchange client: a Custom API client tied to the MCP API
auth0 api post clients --data '{"name":"Orders exchange client","app_type":"resource_server","resource_server_identifier":"http://localhost:3002/mcp"}'
auth0 api patch "clients/YOUR_EXCHANGE_CLIENT_ID" --data '{"token_exchange":{"allow_any_profile_of_type":["on_behalf_of_token_exchange"]}}'
# 3. Grant for the exchange client (subject_type user = on behalf of a shopper)
auth0 api post client-grants --data '{"client_id":"YOUR_EXCHANGE_CLIENT_ID","audience":"https://fastmcp-orders.api/","scope":["read:orders","write:orders"],"subject_type":"user"}'
# 4. Allow the exchange without user consent (the orders API needs this setting on)
auth0 api patch "resource-servers/YOUR_ORDERS_API_ID" --data '{"skip_consent_for_verifiable_first_party_clients":true}'
# 5. Test shopper in a database connection that third-party clients (Claude Code) may use
auth0 users create --connection-name Username-Password-Authentication --email shopper@example.com --name "Test Shopper" --password "CHOOSE_A_STRONG_PASSWORD"
auth0 api patch "connections/YOUR_CONNECTION_ID" --data '{"is_domain_connection":true}'
# 6. Claude Code client: in the Dashboard, under Settings > Advanced, turn on Client ID Metadata Document Registration
#    and set Resource Parameter Compatibility Profile to compatibility, then register the client
auth0 api post "clients/cimd/register" --data '{"external_client_id":"https://claude.ai/oauth/claude-code-client-metadata"}'
auth0 api post client-grants --data '{"client_id":"YOUR_TPC_CLIENT_ID","audience":"http://localhost:3002/mcp","scope":["tool:cancel_order"],"subject_type":"user"}'
```

Making the connection domain-level (step 5) lets every client on the tenant use it, so run it on a development tenant. The Resource Parameter Compatibility Profile (step 6) is a tenant setting, so test your other applications after you change it. The exchange client's id and secret go in `AUTH0_CLIENT_ID` and `AUTH0_CLIENT_SECRET`.

A real MCP client signs in through your tenant, so the tenant has to accept that client. [MCP clients and tenant settings](https://github.com/auth0/auth0-ai-js/blob/main/packages/ai-mcp/docs/McpClients.md) explains what that takes for Claude Code. This sample was not tried with a specific MCP client. Any client that follows the protected resource metadata of the server and supports OAuth should be able to sign in.

## Run

Node.js 20 or later is required.

```sh
cd auth-for-mcp/ai-fastmcp-js
npm install
cp .env.example .env   # fill in the domain, client id and secret
npm run start:api      # orders API on port 3004
npm run start          # MCP server, in a second terminal
```

Node's `--env-file` support reads the `.env` file, so you need no extra package. The MCP server listens on the port of `AUTH0_AUDIENCE` (3002 in `.env.example`) and serves the route at its path (`/mcp`), so the URL is set in one place. Set `MCP_PORT` only when a proxy makes the public port differ from the listening port.

To see the challenge, request the endpoint without a token (`curl -si http://localhost:3002/mcp` answers 401 with a `WWW-Authenticate` header). To call the server without an MCP client, send a request with an access token issued for `AUTH0_AUDIENCE`:

```sh
curl -s -X POST http://localhost:3002/mcp \
  -H "authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'
```

`whoami` works with any such token. `list_orders` and `cancel_order` exchange the token on behalf of a user, so they need a token that a user signed in for, because the grants use `subject_type` `user`.

With `MCP_REQUIRED_SCOPES` unset, any signed-in caller reaches the server and each tool checks its own scope; the metadata document lists `tool:cancel_order` as `scopes_supported`. With it set, the 401 challenge of a request without credentials names the scopes, and the metadata document lists them next to `tool:cancel_order`.

## Check

```sh
npm run type-check
npm run lint
npm run build
npm test
```

The sample needs FastMCP 4.22.0 or newer, the oldest release `@auth0/ai-fastmcp` supports. It pins `@auth0/ai-fastmcp` and `@auth0/ai-mcp` to the exact beta release `1.0.0-beta.1`.

`npm test` runs both servers on loopback with a mocked Auth0 tenant. It makes no network calls. The mock tenant and the token helpers are in `test/support.ts`.
