## Connected MCP: Call a remote MCP server with Auth0 Token Vault

This sample shows how an AI agent can call **remote [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) servers** on the user's
behalf — without the agent ever holding the user's credentials for those services.

It ships with nine pre-configured MCP servers: **Notion**, **GitHub**, **Linear**,
**Atlassian** (Jira + Confluence), **Cloudflare**, **Sentry**, **Asana**, **Slack**, and **Salesforce**. The same
pattern extends to any OAuth 2.0-protected MCP server.

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

In each section below, the connection name must match the `connection` value in
`src/integrations/mcp/servers.ts`.

### Notion

Notion's MCP server has no built-in Auth0 social connection, so it is added as a
**Custom OAuth2 connection** (`strategy: "oauth2"`). The steps below use the
[Management API](https://auth0.com/docs/api/management/v2) directly — there is no
dashboard UI for this strategy.

**1. Register an OAuth client with Notion via Dynamic Client Registration (DCR).**
Notion's MCP server supports DCR, so no Notion app needs to be created by hand.
Replace `YOUR_AUTH0_DOMAIN` with your Auth0 domain (the value of `AUTH0_DOMAIN` in `.env.local`):

```bash
curl -s --request POST \
  --url 'https://mcp.notion.com/register' \
  --header 'content-type: application/json' \
  --data '{
    "client_name": "Auth0 Connected MCP Sample",
    "redirect_uris": ["https://YOUR_AUTH0_DOMAIN/login/callback"],
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
export DOMAIN="YOUR_AUTH0_DOMAIN"
```

> The dashboard token is short-lived (24h) — fine for this one-time setup. For a
> repeatable script, request one via the client-credentials grant from a
> Machine-to-Machine app authorized for the Management API instead.

**3. Create the Custom OAuth2 connection.** Use the `client_id` from step 1 and your
sample app's Auth0 client id in `enabled_clients`:

```bash
curl -s --request POST \
  --url "https://$DOMAIN/api/v2/connections" \
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
- **`client_secret: ""`** — empty because DCR issued a public client; for a server
  that does _not_ support DCR (e.g. GitHub), create an OAuth app manually and paste
  in the `client_id` and `client_secret` instead.

The response includes the connection `id` (e.g. `con_…`); save it for the next step.

**4. Enable Token Vault (connected accounts) on the connection** and turn off
authentication, since the connection is not used to log users in:

```bash
curl -s --request PATCH \
  --url "https://$DOMAIN/api/v2/connections/<CONNECTION_ID>" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{"connected_accounts":{"active":true}}'

curl -s --request PATCH \
  --url "https://$DOMAIN/api/v2/connections/<CONNECTION_ID>" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{"authentication":{"active":false}}'
```


### GitHub

> Use a **GitHub App**, not an OAuth App — only GitHub Apps with token expiration enabled issue refresh tokens. Permissions are set on the GitHub App, not in the Auth0 connection.

**1. Create a GitHub App** at [https://github.com/settings/apps/new](https://github.com/settings/apps/new):

- **Callback URL:** `https://YOUR_AUTH0_DOMAIN/login/callback`
- **Expire user authorization tokens:** ✓ enabled ← required for refresh token issuance
- **Request user authorization (OAuth) during installation:** ✓ enabled
- **Webhook:** disabled (not needed)
- Set repository and account permissions as needed for your use case

Note the **Client ID** and generate a **Client Secret**.

**2. Get a Management API access token** — see the Notion section above for instructions.

**3. Create the Auth0 connection** using the Management API:

```bash
curl -s --request POST \
  --url "https://$DOMAIN/api/v2/connections" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{
    "name": "github",
    "strategy": "github",
    "options": {
      "client_id": "<GITHUB_APP_CLIENT_ID>",
      "client_secret": "<GITHUB_APP_CLIENT_SECRET>"
    },
    "enabled_clients": ["<YOUR_APP_CLIENT_ID>"],
    "connected_accounts": {"active": true},
    "authentication": {"active": false}
  }'
```


### Linear

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
    "redirect_uris": ["https://YOUR_AUTH0_DOMAIN/login/callback"],
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
  --url "https://$DOMAIN/api/v2/connections" \
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


### Atlassian

Atlassian's MCP server (`https://mcp.atlassian.com/v1/mcp/authv2`) covers both Jira
and Confluence through a single connection. It supports Dynamic Client Registration
(DCR), so no Atlassian OAuth app needs to be created by hand.

**Before you start:** You need an Atlassian account with at least one Jira or
Confluence site. The Rovo MCP Server requires site access to authorize. Also, your
Auth0 callback URL must be allowlisted — complete step 4 below before attempting the
OAuth flow, or you will see a "Your organization admin must authorize access from this
redirect URL" error.

**1. Register an OAuth client with Atlassian via DCR:**

```bash
curl -s --request POST \
  --url 'https://cf.mcp.atlassian.com/v1/register' \
  --header 'content-type: application/json' \
  --data '{
    "client_name": "Auth0 Connected MCP Sample",
    "redirect_uris": ["https://YOUR_AUTH0_DOMAIN/login/callback"],
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
  --url "https://$DOMAIN/api/v2/connections" \
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

- **`scope: ""`** — Atlassian's MCP server manages scopes automatically for
  DCR-registered clients; no scopes need to be specified.
- **`authorizationURL` / `tokenURL`** — Atlassian uses split hosting: the
  authorization endpoint is on `mcp.atlassian.com` while the token endpoint is on
  `cf.mcp.atlassian.com`. Use each URL as-is.

**4. Allowlist your Auth0 callback domain in Atlassian:**

The Atlassian Rovo MCP Server requires explicit domain approval before any OAuth
client can complete the authorization flow. Log in to
[admin.atlassian.com](https://admin.atlassian.com), navigate to your site's
**Rovo MCP Server settings** → **Your domains**, and add `https://YOUR_AUTH0_DOMAIN/login/callback`.


### Cloudflare

Cloudflare's MCP server (`https://mcp.cloudflare.com/mcp`) supports Dynamic Client
Registration (DCR), so no Cloudflare app needs to be created by hand.

**1. Register an OAuth client with Cloudflare via DCR:**

```bash
curl -s --request POST \
  --url 'https://mcp.cloudflare.com/register' \
  --header 'content-type: application/json' \
  --data '{
    "client_name": "Auth0 Connected MCP Sample",
    "redirect_uris": ["https://YOUR_AUTH0_DOMAIN/login/callback"],
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
  --url "https://$DOMAIN/api/v2/connections" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{
    "name": "cloudflare",
    "strategy": "oauth2",
    "options": {
      "client_id": "<CLOUDFLARE_CLIENT_ID_FROM_STEP_1>",
      "client_secret": "",
      "authorizationURL": "https://mcp.cloudflare.com/authorize",
      "tokenURL": "https://mcp.cloudflare.com/token",
      "scope": "",
      "pkce_enabled": true,
      "scripts": {
        "fetchUserProfile": "function fetchUserProfile(accessToken, context, callback) { callback(null, { user_id: \"cloudflare|\" + (context.user_id || Date.now()) }); }"
      }
    },
    "enabled_clients": ["<YOUR_APP_CLIENT_ID>"],
    "connected_accounts": {"active": true},
    "authentication": {"active": false}
  }'
```

- Note on **`scope: ""`** — Cloudflare's MCP server manages scopes automatically for
  DCR-registered clients; no scopes need to be specified.


### Asana

Asana's MCP server (`https://mcp.asana.com/v2/mcp`) requires a manually-registered OAuth
app. Asana's DCR endpoint only accepts `localhost` redirect URIs (designed for local MCP
clients), so you must register an app by hand — the same pattern as GitHub.

**1. Create an OAuth app in Asana:**

Go to [app.asana.com/0/my-apps](https://app.asana.com/0/my-apps) → **Create new app** →
choose **MCP app**.

Under the **OAuth** section of the app:
- Add your Auth0 callback URL as a redirect URI: `https://YOUR_AUTH0_DOMAIN/login/callback`

Note the **Client ID** and **Client Secret**.

**2. Get a Management API access token** — see the Notion section above for instructions.

**3. Create the Custom OAuth2 connection:**

```bash
curl -s --request POST \
  --url "https://$DOMAIN/api/v2/connections" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{
    "name": "asana",
    "strategy": "oauth2",
    "options": {
      "client_id": "<ASANA_CLIENT_ID_FROM_STEP_1>",
      "client_secret": "<ASANA_CLIENT_SECRET_FROM_STEP_1>",
      "authorizationURL": "https://app.asana.com/-/oauth_authorize",
      "tokenURL": "https://app.asana.com/-/oauth_token",
      "scope": "default",
      "pkce_enabled": true,
      "scripts": {
        "fetchUserProfile": "function fetchUserProfile(accessToken, context, callback) { callback(null, { user_id: \"asana|\" + (context.user_id || Date.now()) }); }"
      }
    },
    "enabled_clients": ["<YOUR_APP_CLIENT_ID>"],
    "connected_accounts": {"active": true},
    "authentication": {"active": false}
  }'
```

Notes on key fields:

- **`authorizationURL` / `tokenURL`** — Use Asana's main OAuth endpoints (`app.asana.com`),
  not the MCP server endpoints. The MCP server at `mcp.asana.com/v2/mcp` accepts tokens
  issued by `app.asana.com`'s OAuth server.
- **`pkce_enabled: true`** — required even with a client secret.


### Sentry

Sentry's MCP server (`https://mcp.sentry.dev/mcp`) supports Dynamic Client Registration
(DCR), so no Sentry app needs to be created by hand.

**1. Register an OAuth client with Sentry via DCR:**

```bash
curl -s --request POST \
  --url 'https://mcp.sentry.dev/oauth/register' \
  --header 'content-type: application/json' \
  --data '{
    "client_name": "Auth0 Connected MCP Sample",
    "redirect_uris": ["https://YOUR_AUTH0_DOMAIN/login/callback"],
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
  --url "https://$DOMAIN/api/v2/connections" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{
    "name": "sentry",
    "strategy": "oauth2",
    "options": {
      "client_id": "<SENTRY_CLIENT_ID_FROM_STEP_1>",
      "client_secret": "",
      "authorizationURL": "https://mcp.sentry.dev/oauth/authorize",
      "tokenURL": "https://mcp.sentry.dev/oauth/token",
      "scope": "<space-separated scopes for your use case, e.g. org:read project:write team:write event:write>",
      "pkce_enabled": true,
      "scripts": {
        "fetchUserProfile": "function fetchUserProfile(accessToken, context, callback) { callback(null, { user_id: \"sentry|\" + (context.user_id || Date.now()) }); }"
      }
    },
    "enabled_clients": ["<YOUR_APP_CLIENT_ID>"],
    "connected_accounts": {"active": true},
    "authentication": {"active": false}
  }'
```


### Slack

Slack's MCP server (`https://mcp.slack.com/mcp`) requires a manually-registered OAuth app.
Slack does not support Dynamic Client Registration, and its MCP flow uses dedicated
user-token endpoints (`v2_user`) that differ from the standard Slack v2 bot flow.

**1. Create a Slack app** at [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.

Enable MCP server access:
- Go to **Agents** in the left sidebar of your app settings and enable **Model Context Protocol (MCP) Server** access.

Under **OAuth & Permissions**:
- Add your Auth0 callback URL as a redirect URI: `https://YOUR_AUTH0_DOMAIN/login/callback`
- Under **User Token Scopes** (not Bot Token Scopes), review the scopes listed and ensure they cover your use case.

Under **OAuth & Permissions** → **Token Rotation**:
- Enable **Token Rotation** — this is required for Slack to issue a refresh token.
  Without it, Auth0 Token Vault cannot store the connection.

Under **Install App**:
- Click **Install to Workspace** and complete the installation.
  Slack requires the app to be installed before the user OAuth flow will show a consent screen.

Note the **Client ID** and **Client Secret** from the app's **Basic Information** page.

**2. Get a Management API access token** — see the Notion section above for instructions.

**3. Create the Custom OAuth2 connection** — set `scope` to match the User Token Scopes you added in step 1:

```bash
curl -s --request POST \
  --url "https://$DOMAIN/api/v2/connections" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{
    "name": "slack",
    "strategy": "oauth2",
    "options": {
      "client_id": "<SLACK_CLIENT_ID>",
      "client_secret": "<SLACK_CLIENT_SECRET>",
      "authorizationURL": "https://slack.com/oauth/v2_user/authorize",
      "tokenURL": "https://slack.com/api/oauth.v2.user.access",
      "scope": "<space-separated list of your User Token Scopes>",
      "pkce_enabled": true,
      "scripts": {
        "fetchUserProfile": "function fetchUserProfile(accessToken, context, callback) { callback(null, { user_id: \"slack|\" + (context.user_id || Date.now()) }); }"
      }
    },
    "enabled_clients": ["<YOUR_APP_CLIENT_ID>"],
    "connected_accounts": {"active": true},
    "authentication": {"active": false}
  }'
```



### Salesforce

**Before you start:** You need a [Salesforce Developer Edition org](https://developer.salesforce.com/signup).

**1. Create an External Client App in Salesforce:**

Go to **Setup → App Manager → New External Client App** (or **Setup → External Client Apps → New**).

Configure:
- **Redirect URI:** `https://YOUR_AUTH0_DOMAIN/login/callback`
- Under **OAuth Settings**, add these OAuth scopes:
  - Perform requests at any time (`refresh_token, offline_access`)
  - Access Salesforce hosted MCP servers (`mcp_api`)
- Enable **Authorization Code and Credentials Flow**
- Under **App Settings**, enable **Issue JSON Web Token (JWT)-based access tokens for named users**

Note the **Consumer Key** (client ID) and **Consumer Secret**.

**2. Activate the MCP server in Salesforce Setup:**

In Setup, search for **MCP Servers** (listed under **Integrations > API Catalog**). On the MCP
Servers page, switch to the **Salesforce Servers** tab. Find the server you want to use (e.g.
`sobject-reads`) and set its status to **Active**.

**3. Get a Management API access token** — see the Notion section above for instructions.

**4. Create the Custom OAuth2 connection:**

```bash
curl -s --request POST \
  --url "https://$DOMAIN/api/v2/connections" \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --data '{
    "name": "salesforce",
    "strategy": "oauth2",
    "options": {
      "client_id": "<SALESFORCE_CONSUMER_KEY>",
      "client_secret": "<SALESFORCE_CONSUMER_SECRET>",
      "authorizationURL": "https://login.salesforce.com/services/oauth2/authorize",
      "tokenURL": "https://login.salesforce.com/services/oauth2/token",
      "scope": "mcp_api",
      "pkce_enabled": true,
      "scripts": {
        "fetchUserProfile": "function fetchUserProfile(accessToken, context, callback) { callback(null, { user_id: \"salesforce|\" + (context.user_id || Date.now()) }); }"
      }
    },
    "enabled_clients": ["<YOUR_APP_CLIENT_ID>"],
    "connected_accounts": {"active": true},
    "authentication": {"active": false}
  }'
```

---

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), log in, and ask the assistant
something like `List my GitHub repositories`, `Search my Notion for meeting notes`, `List my Jira projects`, or `List my Slack channels`.
You'll be prompted to connect each account the first time it's needed, then the agent
will call the respective MCP server on your behalf.

### Configuration

| Variable               | Purpose                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| `ENABLED_MCP_SERVERS`  | Comma-separated list of MCP servers to enable. Defaults to `notion`. Available: `notion`, `github`, `linear`, `atlassian`, `cloudflare`, `sentry`, `asana`, `slack`, `salesforce`. |
| `NOTION_MCP_URL`       | Optional override for the Notion MCP endpoint (defaults to the hosted server). |
| `GITHUB_MCP_URL`       | Optional override for the GitHub MCP endpoint (defaults to the hosted server). |
| `LINEAR_MCP_URL`       | Optional override for the Linear MCP endpoint (defaults to the hosted server). |
| `ATLASSIAN_MCP_URL`    | Optional override for the Atlassian MCP endpoint (defaults to the hosted server). |
| `CLOUDFLARE_MCP_URL`   | Optional override for the Cloudflare MCP endpoint (defaults to the hosted server). |
| `SENTRY_MCP_URL`       | Optional override for the Sentry MCP endpoint (defaults to the hosted server). |
| `ASANA_MCP_URL`        | Optional override for the Asana MCP endpoint (defaults to the hosted server). |
| `SLACK_MCP_URL`        | Optional override for the Slack MCP endpoint (defaults to the hosted server). |
| `SALESFORCE_MCP_URL`   | Optional override for the Salesforce MCP endpoint (defaults to the `sobject-reads` hosted server). |

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
