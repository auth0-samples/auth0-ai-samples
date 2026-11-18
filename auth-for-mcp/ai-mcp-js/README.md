# Online store MCP server with Auth0 token delegation (`@auth0/ai-mcp`)

This is the finished server. To build it step by step, start from [`ai-mcp-js-starter`](../ai-mcp-js-starter), the same project without the Auth0 MCP SDK wiring.

A small MCP server built with `@auth0/ai-mcp` and the MCP TypeScript SDK. It plays an online store assistant. It checks the access token on every request, then calls the store's Orders, Inventory and Analytics APIs, either as the signed-in shopper (on-behalf-of token exchange) or as itself (client credentials). A second small process plays the store APIs and verifies every token it receives.

## What it shows

- `src/auth.ts` holds all the SDK wiring: one `createNodeMcpHandler` call with the tenant settings passed inline (domain, audience, client id and secret, a token store). The handler builds the client itself, takes its resource URL from the audience and its authorization server from the tenant domain, so each is configured once. `src/mcp-app.ts` holds only the tools and hands them to it. A server that names its variables `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID` and `AUTH0_CLIENT_SECRET` can leave the settings out and let the handler read the environment. The `McpServer` is served over Streamable HTTP. Requests without a valid token are answered with a `WWW-Authenticate` challenge before any tool runs. The server also publishes its protected resource metadata (RFC 9728).
- Every tool is wrapped in `withRequiredScopes`. A caller without the tool's scope gets an error result for that tool only (HTTP 200); the other tools stay available.
- `order_status_report` (scope `tool:order_status_report`, optional `order_id`) exchanges the caller's token twice, once for Orders (`read:orders`) and once for Inventory (`read:inventory`), and lists the orders with stock levels.
- `fulfill_order` (scope `tool:fulfill_order`, required `order_id`) asks Orders for the same `read:orders` token, so a call right after a status report reuses the saved token, and asks Inventory for `read:inventory write:inventory` to reserve stock. Fulfilling the same order twice changes stock only once.
- `sales_analytics_report` (scope `tool:sales_analytics_report`) uses `getClientCredentialsToken`: the server acts as itself, with no shopper involved.
- Only the exchanged token is sent downstream, never the caller's own token. Failures come back as fixed messages, and each call stops after `DOWNSTREAM_TIMEOUT_MS`.
- `src/downstream-api.ts` verifies every token (RS256 signature from the tenant JWKS, issuer, the audience of the service being called, expiry, subject and scope) before it returns data. Each answer includes a `verified` block naming the audience, scope and acting client it checked, never the token.

Seed data lives in memory and resets on restart. Each shopper gets their own three starter orders, ORD-1001 to ORD-1003, the first time they ask, and the store API returns only the orders of the caller. A fourth order, ORD-9001, belongs to another shopper, so asking for it answers "not found". Stock is shared by all shoppers: SKU-HEAD-01 (24), SKU-KEYB-02 (12) and SKU-DOCK-03 (7).

## Set up your tenant

On-behalf-of token exchange must be enabled on your tenant. Enabling it may require Auth0 support. A rejected exchange has several possible causes: the exchange is not enabled on the tenant, the exchange client lacks the profile, a regular application is used as the exchange client (Auth0 then answers HTTP 400 `invalid_request` with `Client must be a Custom API Client with resource_server_id`), the subject token was issued for another API than the one of the exchange client (400 `invalid_request`, `This client cannot exchange access tokens for this audience.`), the downstream API does not allow skipping user consent for verifiable first-party clients (400 `invalid_request`, `The API must have "Allow Skipping User Consent for Verifiable First-Party Clients" enabled.`), or a client grant is missing. The tool only answers "Could not reach the store API" in every case, so read the reason in the server log, where the example prints the error and its causes, and in the tenant logs (Dashboard, Monitoring, Logs). The commands use the [Auth0 CLI](https://github.com/auth0/auth0-cli). Replace each `YOUR_...` with the id from the previous command's output.

```bash
auth0 login --scopes create:client_grants,update:connections
# 1. APIs: the MCP server (identifier = MCP_SERVER_URL) and the three store services
auth0 apis create --name "Store MCP" --identifier "http://localhost:3001/mcp" --signing-alg RS256 \
  --scopes "tool:order_status_report,tool:fulfill_order,tool:sales_analytics_report"
auth0 apis create --name "Orders Service" --identifier "https://orders.api/" --signing-alg RS256 --scopes "read:orders"
auth0 apis create --name "Inventory Service" --identifier "https://inventory.api/" --signing-alg RS256 --scopes "read:inventory,write:inventory"
auth0 apis create --name "Analytics Service" --identifier "https://analytics.api/" --signing-alg RS256 --scopes "read:analytics"
# 2. Exchange client: a Custom API client tied to the MCP API (a regular app cannot exchange tokens)
auth0 api post clients --data '{"name":"Store exchange client","app_type":"resource_server","resource_server_identifier":"http://localhost:3001/mcp"}'
auth0 api patch "clients/YOUR_EXCHANGE_CLIENT_ID" --data '{"token_exchange":{"allow_any_profile_of_type":["on_behalf_of_token_exchange"]}}'
# A PATCH replaces grant_types, so read the list first and send it back with client_credentials added
auth0 api get "clients/YOUR_EXCHANGE_CLIENT_ID?fields=grant_types"
auth0 api patch "clients/YOUR_EXCHANGE_CLIENT_ID" --data '{"grant_types":["EXISTING_GRANT_TYPES","client_credentials"]}'
# 3. Grants for the exchange client (subject_type user = on behalf of a shopper; none = its own token)
auth0 api post client-grants --data '{"client_id":"YOUR_EXCHANGE_CLIENT_ID","audience":"https://orders.api/","scope":["read:orders"],"subject_type":"user"}'
auth0 api post client-grants --data '{"client_id":"YOUR_EXCHANGE_CLIENT_ID","audience":"https://inventory.api/","scope":["read:inventory","write:inventory"],"subject_type":"user"}'
auth0 api post client-grants --data '{"client_id":"YOUR_EXCHANGE_CLIENT_ID","audience":"https://analytics.api/","scope":["read:analytics"]}'
# 4. Allow the exchange without user consent (the downstream APIs need this setting on, or the exchange is rejected)
auth0 api patch "resource-servers/YOUR_ORDERS_API_ID" --data '{"skip_consent_for_verifiable_first_party_clients":true}'
auth0 api patch "resource-servers/YOUR_INVENTORY_API_ID" --data '{"skip_consent_for_verifiable_first_party_clients":true}'
# 5. Test shopper in a database connection that third-party clients (Claude Code) may use
auth0 users create --connection-name Username-Password-Authentication --email shopper@example.com --name "Test Shopper" --password "CHOOSE_A_STRONG_PASSWORD"
auth0 api patch "connections/YOUR_CONNECTION_ID" --data '{"is_domain_connection":true}'
# 6. Claude Code client: in the Dashboard, under Settings > Advanced, turn on Client ID Metadata Document Registration
#    and set Resource Parameter Compatibility Profile to compatibility, then register the client
auth0 api post "clients/cimd/register" --data '{"external_client_id":"https://claude.ai/oauth/claude-code-client-metadata"}'
auth0 api post client-grants --data '{"client_id":"YOUR_TPC_CLIENT_ID","audience":"http://localhost:3001/mcp","scope":["tool:order_status_report","tool:fulfill_order","tool:sales_analytics_report"],"subject_type":"user"}'
```

Making the connection domain-level (step 5) lets every client on the tenant use it, so run it on a development tenant. The Resource Parameter Compatibility Profile (step 6) is a tenant setting, so test your other applications after you change it.

Claude Code needs two tenant settings, both under Settings, Advanced: Client ID Metadata Document Registration on, and Resource Parameter Compatibility Profile set to `compatibility`. To check them, run this read-only command and look at `client_id_metadata_document_supported` (must be `true`) and `resource_parameter_profile` (must be `compatibility`):

```bash
auth0 api get tenants/settings
```

If the command answers 403, your login may lack the `read:tenant_settings` scope. Log in again with `auth0 login --scopes read:tenant_settings` and retry.

If sign-in fails:

- `Unknown client`: Client ID Metadata Document Registration is off, or the client is not registered. Turn it on, then run the register command in step 6.
- `userinfo audience is not allowed for this client`: Resource Parameter Compatibility Profile is still `audience`. Set it to `compatibility`.
- Every tool answers with an insufficient scope error (HTTP 200): the client grant for the MCP API was not updated with the tool scope, so the token does not carry it. Add the scope to the grant, then sign in again.
- Every call returns 401: `AUTH0_AUDIENCE` does not match the API identifier in Auth0 exactly. Make them equal.

[MCP clients and tenant settings](https://github.com/auth0/auth0-ai-js/blob/main/packages/ai-mcp/docs/McpClients.md) explains both settings and lists more errors. The exchange client's id and secret go in `AUTH0_CLIENT_ID` and `AUTH0_CLIENT_SECRET`.

## Beyond one process

The sample keeps tokens in `MemoryIndexedTokenStore`, which lives in the memory of one process. For several instances, back the store with shared storage and wrap it with `createEncryptedTokenStore` (see [Token caching](https://github.com/auth0/auth0-ai-js/blob/main/packages/ai-mcp/docs/TokenCaching.md)). The sample does not use Token Vault or organization policy; see [Token Vault](https://github.com/auth0/auth0-ai-js/blob/main/packages/ai-mcp/docs/TokenVault.md) and [Organization policy](https://github.com/auth0/auth0-ai-js/blob/main/packages/ai-mcp/docs/OrganizationPolicy.md) for those.

## Run

Node.js 20 or later is required.

```sh
cd auth-for-mcp/ai-mcp-js
npm install
cp .env.example .env   # fill in the domain, client id and secret
npm run start:api      # store APIs on port 3003
npm run start          # MCP server on port 3001, in a second terminal
```

To see the challenge without a client, request the MCP endpoint without a token. The answer is 401 with a `WWW-Authenticate` header that carries `resource_metadata`:

```sh
curl -si http://localhost:3001/mcp
```

To call a tool without an MCP client, send a token issued for `MCP_SERVER_URL`:

```sh
curl -s -X POST http://localhost:3001/mcp \
  -H "authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Connect Claude Code with the MCP URL of this example, which ends in `/mcp`.

```sh
claude mcp add --transport http store http://localhost:3001/mcp
```

Start `claude`, type `/mcp`, pick `store` and choose Authenticate. Sign in as the test shopper in the browser and allow the three permissions if asked. Then try:

- `show my recent orders`: two token exchanges, for Orders and Inventory, and the three orders with stock.
- `fulfill order ORD-1002`: stock for the keyboard goes from 12 to 11. Only the Inventory write token is new.
- `run the sales analytics report`: the server fetches revenue with its own token.

With `MCP_REQUIRED_SCOPES` unset, any signed-in caller reaches the server and each tool checks its own scope. The server lists the three tool scopes as `scopes_supported` in its protected resource metadata, which is how a client learns to ask for them. A client that asks for no scope can get a token without them, and then every tool refuses the call. Scopes you list in `MCP_REQUIRED_SCOPES` are also sent as `scope` in the 401 challenge for a request without a credential. The tool scopes stay in `scopes_supported` either way. Remove the server again with `claude mcp remove store`.

The `.env` file is read with Node's `--env-file` support, so no extra package is needed.

## Check

```sh
npm run type-check
npm run lint
npm run build
npm test
```

The sample needs `@modelcontextprotocol/server` 2.3 or newer (the MCP TypeScript SDK v2, which requires Node.js 20 or later) and zod 4.2 or later. It pins `@auth0/ai-mcp` to the exact beta release `1.0.0-beta.1`.

`npm test` runs both servers on loopback with a mocked Auth0 tenant. It makes no network calls. The mock tenant and the token helpers are in `test/support.ts`.
