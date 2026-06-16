## Connected MCP: Call a remote MCP server with Auth0 Token Vault

This sample shows how an AI agent can call **remote MCP servers** on the user's
behalf — without the agent ever holding the user's credentials for those services.

It ships with four pre-configured MCP servers: **Notion**, **GitHub**, **Linear**,
and **Atlassian** (Jira + Confluence). The same pattern extends to any OAuth
2.0-protected MCP server.

The agent authenticates to each MCP server with a short-lived access token that
Auth0 mints from the user's **Connected Account** via
[Token Vault](https://auth0.com/docs/secure/tokens/token-vault). The first time the
user invokes a tool for a given service, they're prompted to connect that account;
after that, the agent transparently exchanges the user's Auth0 refresh token for a
federated access token and presents it as a `Bearer` token to the MCP server.

### How it works

1. The chat route collects tools from every configured MCP server (`src/integrations/mcp/`).
2. For each server, `getConnectionAccessToken` performs a **Token Vault exchange**
   (`getAccessTokenForConnection`) to obtain an access token for the current user.
   - If the user hasn't connected that account yet, this throws a
     `TokenVaultInterrupt`, which the chat route serializes to drive the
     connect-account consent popup.
3. `connectMcpServer` opens the remote MCP server over Streamable HTTP, passing the
   token as `Authorization: Bearer <token>`, and returns the discovered tools.
4. The Vercel AI SDK calls those tools as part of the agent loop.

Auth0 never learns the MCP server URL — it only mints a federated token for the
Connection. The MCP endpoint lives in app config (`src/integrations/mcp/servers.ts`), not in
the tenant.

## 🚀 Getting started

Clone the repo and enter this app's directory:

```bash
git clone https://github.com/auth0-samples/auth0-ai-samples.git
cd auth0-ai-samples/call-apis-on-users-behalf/others-api/connected-mcp-vercel-ai-next-js
```

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

You'll need:

- `OPENAI_API_KEY` — for the chat model.
- Auth0 application credentials (`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
  `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `APP_BASE_URL`).

Set up an Auth0 tenant with Token Vault enabled, following the
[Connected Accounts / Call other's APIs on user's behalf](https://auth0.com/ai/docs/get-started/call-others-apis-on-users-behalf)
guide, then add a Connection for each MCP server you want to use.

#### Creating the Notion Connection

Notion's MCP server has no built-in Auth0 social connection, so it is added as a
**Custom OAuth2 connection** (`strategy: "oauth2"`). The steps below use the
[Management API](https://auth0.com/docs/api/management/v2) directly — there is no
dashboard UI for this strategy.

**1. Register an OAuth client with Notion via Dynamic Client Registration (DCR).**
Notion's MCP server supports DCR, so no Notion app needs to be created by hand.
Replace `YOUR_TENANT` with your Auth0 domain:

```bash
curl -s --request POST \
  --url 'https://mcp.notion.com/register' \
  --header 'content-type: application/json' \
  --data '{
    "client_name": "Auth0 Connected MCP Sample",
    "redirect_uris": ["https://YOUR_TENANT.us.auth0.com/login/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none"
  }'
```

The response contains a `client_id`. `token_endpoint_auth_method: "none"` makes it a
**public client** (no secret) — PKCE secures the code exchange instead.

**2. Get a Management API access token.** The quickest way is to copy a token from
the [API Explorer](https://manage.auth0.com/#/apis/management/explorer) in the Auth0
dashboard (**Applications → APIs → Auth0 Management API → API Explorer**); it needs
at least the `create:connections` and `update:connections` scopes. Export it along
with your tenant domain:

```bash
export TOKEN="<MANAGEMENT_API_TOKEN>"
export TENANT="YOUR_TENANT.us.auth0.com"
```

> The dashboard token is short-lived (24h) — fine for this one-time setup. For a
> repeatable script, request one via the client-credentials grant from a
> Machine-to-Machine app authorized for the Management API instead.

**3. Create the Custom OAuth2 connection.** Use the `client_id` from step 1 and your
sample app's Auth0 client id in `enabled_clients`:

```bash
curl -s --request POST \
  --url "https://$TENANT/api/v2/connections" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{
    "name": "notion",
    "strategy": "oauth2",
    "options": {
      "client_id": "<NOTION_CLIENT_ID_FROM_STEP_1>",
      "client_secret": "",
      "authorizationURL": "https://mcp.notion.com/authorize",
      "tokenURL": "https://mcp.notion.com/token",
      "scope": "",
      "pkce_enabled": true,
      "scripts": {
        "fetchUserProfile": "function fetchUserProfile(accessToken, context, callback) { callback(null, { user_id: \"notion|\" + (context.user_id || Date.now()) }); }"
      }
    },
    "enabled_clients": ["<YOUR_APP_CLIENT_ID>"]
  }'
```

Notes on the key fields:

- **`strategy: "oauth2"`** — this is what makes it a Custom OAuth2 connection.
- **`pkce_enabled: true`** — required; Notion's `/authorize` and `/token` endpoints
  expect PKCE.
- **`client_secret: ""`** — empty because DCR issued a public client; for a server
  that does _not_ support DCR (e.g. GitHub), create an OAuth app manually and paste
  in the `client_id` and `client_secret` instead.
- **`fetchUserProfile`** — a stub that mints a synthetic `user_id`. The connection is
  only used to obtain a connected-account token, not as a login identity, so no real
  profile mapping is needed.

The response includes the connection `id` (e.g. `con_…`); save it for the next step.

**4. Enable Token Vault (connected accounts) on the connection** and turn off
authentication, since the connection is not used to log users in:

```bash
curl -s --request PATCH \
  --url "https://$TENANT/api/v2/connections/<CONNECTION_ID>" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{"connected_accounts":{"active":true}}'

curl -s --request PATCH \
  --url "https://$TENANT/api/v2/connections/<CONNECTION_ID>" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{"authentication":{"active":false}}'
```

The connection name (`notion`) must match the `connection` value in
`src/integrations/mcp/servers.ts`.

#### Creating the GitHub Connection

GitHub's MCP server (`https://api.githubcopilot.com/mcp`) uses Auth0's built-in
`github` strategy. There are two important constraints specific to GitHub:

- **GitHub Apps only — not OAuth Apps.** GitHub OAuth Apps never issue refresh
  tokens. Auth0 Token Vault requires a refresh token to store the federated
  connection. GitHub Apps with token expiration enabled issue both an access token
  and a refresh token, making them compatible.
- **Scopes are set on the GitHub App, not in Token Vault.** The `scopes` field on
  the connection has no effect for the built-in `github` strategy. Grant the
  permissions your use case needs when registering the GitHub App in
  [GitHub Developer Settings](https://github.com/settings/apps).

**1. Create a GitHub App** at [https://github.com/settings/apps/new](https://github.com/settings/apps/new):

- **Callback URL:** `https://YOUR_TENANT.auth0.com/login/callback`
- **Expire user authorization tokens:** ✓ enabled ← required for refresh token issuance
- **Request user authorization (OAuth) during installation:** ✓ enabled
- **Webhook:** disabled
- Set repository and account permissions as needed for your use case

Note the **Client ID** and generate a **Client Secret**.

**2. Create the Auth0 connection** using the Management API:

```bash
curl -s --request POST \
  --url "https://$TENANT/api/v2/connections" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{
    "name": "github",
    "strategy": "github",
    "options": {
      "client_id": "<GITHUB_APP_CLIENT_ID>",
      "client_secret": "<GITHUB_APP_CLIENT_SECRET>"
    },
    "enabled_clients": ["<YOUR_APP_CLIENT_ID>"]
  }'
```

**3. Enable Token Vault on the connection:**

```bash
curl -s --request PATCH \
  --url "https://$TENANT/api/v2/connections/<CONNECTION_ID>" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{"connected_accounts": {"active": true}}'
```

The connection name (`github`) must match the `connection` value in
`src/integrations/mcp/servers.ts`.

#### Creating the Linear Connection

Linear's MCP server (`https://mcp.linear.app/mcp`) has no built-in Auth0 social
connection, so it is added as a **Custom OAuth2 connection** (`strategy: "oauth2"`).
Linear supports Dynamic Client Registration (DCR), so no Linear OAuth app needs to
be created by hand.

**1. Register an OAuth client with Linear via DCR:**

```bash
curl -s --request POST \
  --url 'https://mcp.linear.app/register' \
  --header 'content-type: application/json' \
  --data '{
    "client_name": "Auth0 Connected MCP Sample",
    "redirect_uris": ["https://YOUR_TENANT.auth0.com/login/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none"
  }'
```

Note the `client_id` from the response. `token_endpoint_auth_method: "none"` makes
it a **public client** — PKCE secures the code exchange instead of a client secret.

**2. Get a Management API access token** — see the Notion section above for instructions.

**3. Create the Custom OAuth2 connection:**

```bash
curl -s --request POST \
  --url "https://$TENANT/api/v2/connections" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{
    "name": "linear",
    "strategy": "oauth2",
    "options": {
      "client_id": "<LINEAR_CLIENT_ID_FROM_STEP_1>",
      "client_secret": "",
      "authorizationURL": "https://mcp.linear.app/authorize",
      "tokenURL": "https://mcp.linear.app/token",
      "scope": "read",
      "pkce_enabled": true,
      "scripts": {
        "fetchUserProfile": "function fetchUserProfile(accessToken, context, callback) { callback(null, { user_id: \"linear|\" + (context.user_id || Date.now()) }); }"
      }
    },
    "enabled_clients": ["<YOUR_APP_CLIENT_ID>"],
    "connected_accounts": {"active": true},
    "authentication": {"active": false}
  }'
```

Notes on key fields:

- **`strategy: "oauth2"`** — Custom OAuth2 connection.
- **`pkce_enabled: true`** — required; Linear's endpoints expect PKCE.
- **`client_secret: ""`** — empty because DCR issued a public client.
- **`connected_accounts: {"active": true}`** — enables Token Vault for this connection.
- **`authentication: {"active": false}`** — this connection is only used to obtain a
  connected-account token, not as a login identity.
- **`enabled_clients`** — must be set in the initial POST; it cannot be added via PATCH.
- **`fetchUserProfile`** — a stub that mints a synthetic `user_id`. No real profile
  mapping is needed since the connection is not used for login.

The connection name (`linear`) must match the `connection` value in
`src/integrations/mcp/servers.ts`.

#### Creating the Atlassian Connection

Atlassian's MCP server (`https://mcp.atlassian.com/v1/mcp/authv2`) covers both Jira
and Confluence through a single connection. It supports Dynamic Client Registration
(DCR), so no Atlassian OAuth app needs to be created by hand.

**Before you start:** The Atlassian Rovo MCP Server requires your Auth0 tenant's
callback domain to be allowlisted. Complete step 4 below before attempting the OAuth
flow, or you will see a "Your organization admin must authorize access from this
redirect URL" error.

**1. Register an OAuth client with Atlassian via DCR:**

```bash
curl -s --request POST \
  --url 'https://cf.mcp.atlassian.com/v1/register' \
  --header 'content-type: application/json' \
  --data '{
    "client_name": "Auth0 Connected MCP Sample",
    "redirect_uris": ["https://YOUR_TENANT.auth0.com/login/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none"
  }'
```

Note the `client_id` from the response.

**2. Get a Management API access token** — see the Notion section above for instructions.

**3. Create the Custom OAuth2 connection:**

```bash
curl -s --request POST \
  --url "https://$TENANT/api/v2/connections" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{
    "name": "atlassian",
    "strategy": "oauth2",
    "options": {
      "client_id": "<ATLASSIAN_CLIENT_ID_FROM_STEP_1>",
      "client_secret": "",
      "authorizationURL": "https://mcp.atlassian.com/v1/authorize",
      "tokenURL": "https://cf.mcp.atlassian.com/v1/token",
      "scope": "",
      "pkce_enabled": true,
      "scripts": {
        "fetchUserProfile": "function fetchUserProfile(accessToken, context, callback) { callback(null, { user_id: \"atlassian|\" + (context.user_id || Date.now()) }); }"
      }
    },
    "enabled_clients": ["<YOUR_APP_CLIENT_ID>"],
    "connected_accounts": {"active": true},
    "authentication": {"active": false}
  }'
```

Notes on key fields:

- **`strategy: "oauth2"`** — Custom OAuth2 connection.
- **`pkce_enabled: true`** — required; Atlassian's endpoints expect PKCE.
- **`client_secret: ""`** — empty because DCR issued a public client.
- **`scope: ""`** — Atlassian's MCP server manages scopes automatically for
  DCR-registered clients; no scopes need to be specified.
- **`authorizationURL` / `tokenURL`** — Atlassian uses split hosting: the
  authorization endpoint is on `mcp.atlassian.com` while the token endpoint is on
  `cf.mcp.atlassian.com`. Use each URL as-is.
- **`connected_accounts: {"active": true}`** — enables Token Vault for this connection.
- **`authentication: {"active": false}`** — this connection is only used to obtain a
  connected-account token, not as a login identity.
- **`enabled_clients`** — must be set in the initial POST; it cannot be added via PATCH.

**4. Allowlist your Auth0 callback domain in Atlassian:**

The Atlassian Rovo MCP Server requires explicit domain approval before any OAuth
client can complete the authorization flow. Log in to
[admin.atlassian.com](https://admin.atlassian.com), navigate to your site's
**Rovo MCP Server settings**, and add your Auth0 callback URL (e.g.
`https://YOUR_TENANT.auth0.com/login/callback`) to the allowed domains list.

The connection name (`atlassian`) must match the `connection` value in
`src/integrations/mcp/servers.ts`.

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), log in, and ask the assistant
something like `List my GitHub repositories`, `Search my Notion for meeting notes`, or `List my Jira projects`.
You'll be prompted to connect each account the first time it's needed, then the agent
will call the respective MCP server on your behalf.

### Configuration

| Variable          | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `NOTION_MCP_URL`  | Optional override for the Notion MCP endpoint (defaults to the hosted server). |
| `GITHUB_MCP_URL`  | Optional override for the GitHub MCP endpoint (defaults to the hosted server). |
| `LINEAR_MCP_URL`  | Optional override for the Linear MCP endpoint (defaults to the hosted server). |
| `ATLASSIAN_MCP_URL` | Optional override for the Atlassian MCP endpoint (defaults to the hosted server). |

To connect a different or additional remote MCP server, edit
`src/integrations/mcp/servers.ts` — each entry pairs an MCP URL with the Auth0 Connection
whose Token Vault tokens authorize it.

## 🧪 Tests

The Token Vault wiring and MCP client are covered by unit tests:

```bash
npm run test
```

## Learn more

- [Token Vault](https://auth0.com/docs/secure/tokens/token-vault)
- [Call Other's APIs on User's Behalf](https://auth0.com/ai/docs/get-started/call-others-apis-on-users-behalf)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)

## License

This project is open-sourced under the MIT License — see the [LICENSE](LICENSE) file for details.
