## Connected MCP: Call a remote MCP server with Auth0 Token Vault

This sample shows how an AI agent can call a **remote MCP server** (Notion's hosted
[Model Context Protocol](https://modelcontextprotocol.io/) server) on the user's
behalf — without the agent ever holding the user's Notion credentials.

The agent authenticates to the MCP server with a short-lived access token that
Auth0 mints from the user's **Connected Account** via
[Token Vault](https://auth0.com/docs/secure/tokens/token-vault). The first time the
user invokes a Notion tool, they're prompted to connect their Notion account; after
that, the agent transparently exchanges the user's Auth0 refresh token for a
federated Notion access token and presents it as a `Bearer` token to the MCP server.

### How it works

1. The chat route collects tools from every configured MCP server (`src/integrations/mcp/`).
2. For each server, `getConnectionAccessToken` performs a **Token Vault exchange**
   (`getAccessTokenForConnection`) to obtain a Notion access token for the current user.
   - If the user hasn't connected their Notion account yet, this throws a
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

Set up an Auth0 tenant with Token Vault enabled and add a **Notion** Connection,
following the [Connected Accounts / Call other's APIs on user's behalf](https://auth0.com/ai/docs/get-started/call-others-apis-on-users-behalf)
guide.

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

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), log in, and ask the assistant
something like `Search my Notion for meeting notes`. You'll be prompted to connect
your Notion account the first time, then the agent will call the Notion MCP server
on your behalf.

### Configuration

| Variable          | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `NOTION_MCP_URL`  | Optional override for the Notion MCP endpoint (defaults to the hosted server). |

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
