## Connected MCP: Call a remote MCP server with Auth0 Token Vault

This sample shows how an AI agent can call **remote [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) servers** on the user's behalf without the agent ever holding the user's credentials for those services.

It ships with twelve pre-configured MCP servers: **Notion**, **GitHub**, **Gmail**, **Google Calendar**, **Google Drive**, **Slack**, **Jira**, **Confluence**, **HubSpot**, **Asana**, **Linear**, **Sentry**, and **Cloudflare**. The same pattern extends to any OAuth 2.0-protected MCP server.

The agent authenticates to each MCP server with a short-lived access token that Auth0 mints from the user's **Connected Account** via [Token Vault](https://auth0.com/docs/secure/tokens/token-vault). The first time the user invokes a tool for a given service, they're prompted to connect that account; after that, the agent transparently exchanges the user's Auth0 refresh token for a federated access token and presents it as a `Bearer` token to the MCP server.

### How it works

1. The chat route collects tools from every configured MCP server (`src/integrations/mcp/`).
2. For each server, `getConnectionAccessToken` performs a **Token Vault exchange** (`getAccessTokenForConnection`) to obtain an access token for the current user.
   - If the user hasn't connected that account yet, this throws a `TokenVaultInterrupt`, which the chat route serializes to drive the connect-account consent popup.
3. `connectMcpServer` opens the remote MCP server over Streamable HTTP, passing the token as `Authorization: Bearer <token>`, and returns the discovered tools.
4. The Vercel AI SDK calls those tools as part of the agent loop.

Auth0 never learns the MCP server URL; it only mints a federated token for the Connection. The MCP endpoint lives in app config (`src/integrations/mcp/servers.ts`), not in the tenant.

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

- `OPENAI_API_KEY` — API key for the chat model.
- Auth0 application credentials (`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `APP_BASE_URL`).

Set up an Auth0 tenant with Token Vault enabled, following the [Connected Accounts / Call other's APIs on user's behalf](https://auth0.com/ai/docs/get-started/call-others-apis-on-users-behalf) guide, then add a Connection for each MCP server you want to use.

### Quick path: Auth0 Dashboard MCP Connections (recommended, Beta)

> **Beta feature:** The Agents → MCP Servers dashboard feature is currently in Beta. For production use or if you encounter issues, use the manual setup path below.

Auth0 now provides pre-configured MCP API templates in the dashboard. The recommended way to set up a connection:

1. Go to **Agents → MCP Servers** in the Auth0 Dashboard
2. Browse the available MCP Connections
3. Click **Add MCP Connection** for the service you want
4. Enter the required OAuth settings (client ID, client secret, additional scopes for your use case)
5. Click **Try Connection** to test the full OAuth flow and verify MCP server connectivity
6. Done — the connection is ready for use

Connections created via the dashboard can also be retrieved and managed via the [Auth0 Management API](https://auth0.com/docs/api/management/v2) `GET /api/v2/api-templates` endpoint.

### Reference: Manual setup via Management API

The sections below provide reference information for manual connection creation. Most users should use the **Dashboard MCP Connections** path above.

In each section, the connection name must match the `connection` value in `src/integrations/mcp/servers.ts`.

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), log in, and ask the assistant something like `List my GitHub repositories`, `Search my Notion for meeting notes`, `List my Jira projects`, or `List my Slack channels`. You'll be prompted to connect each account the first time it's needed, then the agent will call the respective MCP server on your behalf.

### Configuration

Set `ENABLED_MCP_SERVERS` to a comma-separated list of connection names to enable (e.g. `notion,github`). Defaults to `notion`.

| Connection    | URL override          | Setup                       |
| ------------- | --------------------- | --------------------------- |
| `notion`      | `NOTION_MCP_URL`      | [Notion](#notion)           |
| `github`      | `GITHUB_MCP_URL`      | [GitHub](#github)           |
| `gmail`       | `GMAIL_MCP_URL`       | [Google Workspace](#google-workspace-gmail-calendar-drive) |
| `google-calendar` | `GCALENDAR_MCP_URL`   | [Google Workspace](#google-workspace-gmail-calendar-drive) |
| `google-drive` | `GDRIVE_MCP_URL`      | [Google Workspace](#google-workspace-gmail-calendar-drive) |
| `slack`       | `SLACK_MCP_URL`       | [Slack](#slack)             |
| `jira`        | `JIRA_MCP_URL`        | [Jira](#jira)               |
| `confluence`  | `CONFLUENCE_MCP_URL`  | [Confluence](#confluence)   |
| `hubspot`     | `HUBSPOT_MCP_URL`     | [HubSpot](#hubspot)         |
| `asana`       | `ASANA_MCP_URL`       | [Asana](#asana)             |
| `linear`      | `LINEAR_MCP_URL`      | [Linear](#linear)           |
| `sentry`      | `SENTRY_MCP_URL`      | [Sentry](#sentry)           |
| `cloudflare`  | `CLOUDFLARE_MCP_URL`  | [Cloudflare](#cloudflare)   |

To connect a different or additional remote MCP server, edit `src/integrations/mcp/servers.ts`. Each entry pairs an MCP URL with the Auth0 Connection whose Token Vault tokens authorize it.

### Notion

Notion's MCP server has no built-in Auth0 social connection, so it is added as a **Custom OAuth2 connection** (`strategy: "oauth2"`). The steps below use the [Management API](https://auth0.com/docs/api/management/v2) directly; there is no dashboard UI for this strategy.

**1. Register an OAuth client with Notion via Dynamic Client Registration (DCR).** Notion's MCP server supports DCR, so no Notion app needs to be created by hand. Replace `YOUR_AUTH0_DOMAIN` with your Auth0 domain (the value of `AUTH0_DOMAIN` in `.env.local`):

```bash
curl --request POST \
  --url 'https://mcp.notion.com/register' \
  --header 'content-type: application/json' \
  --data '{
    "client_name": "Auth0 Connected MCP Sample",
    "redirect_uris": ["https://YOUR_AUTH0_DOMAIN/login/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "client_secret_basic"
  }'
```

The response contains a `client_id` and a `client_secret` which can use when creating the Notion connection with Auth0.

**2. Get a Management API access token.** The quickest way is to copy a token from the [API Explorer](https://manage.auth0.com/#/apis/management/explorer) in the Auth0 dashboard (**Applications → APIs → Auth0 Management API → API Explorer**); it needs at least the `create:connections` and `update:connections` scopes. Export it along with your tenant domain:

```bash
export TOKEN="<MANAGEMENT_API_TOKEN>"
export DOMAIN="your-tenant.us.auth0.com"
```

> The dashboard token is short-lived (24h), which is fine for this one-time setup. For a repeatable script, request one via the client-credentials grant from a Machine-to-Machine app authorized for the Management API instead.

**3. Create the Auth0 connection** using the Management API with the `client_id` and `client_secret` from step 1. The connection can also be created via the dashboard Agents → MCP Servers feature or programmatically with the Management API `/api/v2/connections` endpoint.

After the Auth0 MCP connection has been created, navigate to the connection's settings view and select the Applications tab. Make sure to enable the Auth0 application that you created in the [Getting started](#-getting-started) section.

Ensure the `NOTION_MCP_SERVER` connection value in `src/integrations/mcp/servers.ts` matches your Auth0 Notion MCP connection's name, example:

```
export const NOTION_MCP_SERVER: McpServerConfig = {
  connection: 'notion',
  url: 'https://mcp.notion.com/mcp',
  scopes: [],
};
```

### GitHub

> Use a **GitHub App**, not an OAuth App. Only GitHub Apps with token expiration enabled issue refresh tokens. Permissions are set on the GitHub App, not in the Auth0 connection.

**1. Create a GitHub App** at [https://github.com/settings/apps/new](https://github.com/settings/apps/new):

- **Callback URL:** `https://YOUR_AUTH0_DOMAIN/login/callback`
- **Expire user authorization tokens:** ✓ enabled ← required for refresh token issuance
- **Request user authorization (OAuth) during installation:** ✓ enabled
- **Webhook:** disabled (not needed)
- Set repository and account permissions as needed for your use case

Note the **Client ID** and generate a **Client Secret**.

**2. Get a Management API access token**. See the Notion section above for instructions.

**3. Create the Auth0 connection** using the Management API with your GitHub App credentials. The connection can also be created via the dashboard Agents → MCP Servers feature or programmatically with the Management API `/api/v2/connections` endpoint.

After the Auth0 MCP connection has been created, navigate to the connection's settings view and select the Applications tab. Make sure to enable the Auth0 application that you created in the [Getting started](#-getting-started) section.

Ensure the `GITHUB_MCP_SERVER` connection value in `src/integrations/mcp/servers.ts` matches your Auth0 GitHub MCP connection's name, example:

```
export const GITHUB_MCP_SERVER: McpServerConfig = {
  connection: 'github',
  url: 'https://api.githubcopilot.com/mcp',
  scopes: [],
};
```

### Google Workspace (Gmail, Calendar, Drive)

Gmail, Google Calendar, and Google Drive each have their own MCP server but share a single OAuth client and Auth0 connection.

**1. Complete the GCP setup** by following the [Google Workspace MCP server setup guide](https://developers.google.com/workspace/guides/configure-mcp-servers):

- Enable the **Workspace MCP API** and the individual **Gmail MCP API**, **Google Drive MCP API**, and **Google Calendar MCP API** in your GCP project.
- Configure the OAuth consent screen and add any test users who will connect.
- Create an **OAuth 2.0 client ID** (Web application type) with `https://YOUR_AUTH0_DOMAIN/login/callback` as an authorized redirect URI.

Note the **Client ID** and **Client Secret**.

**2. Get a Management API access token**. See the Notion section above for instructions.

**3. Create the Auth0 connection** using the Management API with your Google OAuth credentials. The connection can also be created via the dashboard Agents → MCP Servers feature or programmatically with the Management API `/api/v2/connections` endpoint.

After the Auth0 MCP connection has been created, navigate to the connection's settings view and select the Applications tab. Make sure to enable the Auth0 application that you created in the [Getting started](#-getting-started) section.

Ensure the `GMAIL_MCP_SERVER`, `GCALENDAR_MCP_SERVER`, and `GDRIVE_MCP_SERVER` connection values in `src/integrations/mcp/servers.ts` match your Auth0 Google Workspace MCP connection names, example:

```
export const GMAIL_MCP_SERVER: McpServerConfig = {
  connection: 'gmail',
  url: 'https://gmailmcp.googleapis.com/mcp/v1',
  scopes: [],
};

export const GCALENDAR_MCP_SERVER: McpServerConfig = {
  connection: 'google-calendar',
  url: 'https://calendarmcp.googleapis.com/mcp/v1',
  scopes: [],
};

export const GDRIVE_MCP_SERVER: McpServerConfig = {
  connection: 'google-drive',
  url: 'https://drivemcp.googleapis.com/mcp/v1',
  scopes: [],
};
```

**4. Enable the servers in `.env.local`:**

```
ENABLED_MCP_SERVERS=gmail,gcalendar,gdrive
```

The MCP URLs default to the standard Google endpoints. Override them with `GMAIL_MCP_URL`, `GCALENDAR_MCP_URL`, or `GDRIVE_MCP_URL` only if needed.


### Slack

Slack's MCP server (`https://mcp.slack.com/mcp`) requires a manually-registered OAuth app. Slack does not support Dynamic Client Registration, and its MCP flow uses dedicated user-token endpoints (`v2_user`) that differ from the standard Slack v2 bot flow.

**1. Create a Slack app** at [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.

Enable MCP server access:
- Go to **Agents** in the left sidebar of your app settings and enable **Model Context Protocol (MCP) Server** access.

Under **OAuth & Permissions**:
- Add your Auth0 callback URL as a redirect URI: `https://YOUR_AUTH0_DOMAIN/login/callback`
- Under **User Token Scopes** (not Bot Token Scopes), review the scopes listed and ensure they cover your use case.

Under **OAuth & Permissions** → **Token Rotation**:
- Enable **Token Rotation**. This is required for Slack to issue a refresh token. Without it, Auth0 Token Vault cannot store the connection.

Under **Install App**:
- Click **Install to Workspace** and complete the installation. Slack requires the app to be installed before the user OAuth flow will show a consent screen.

Note the **Client ID** and **Client Secret** from the app's **Basic Information** page.

**2. Get a Management API access token**. See the Notion section above for instructions.

**3. Create the Auth0 connection** using the Management API with your Slack credentials, setting the scope to match the User Token Scopes from step 1. The connection can also be created via the dashboard Agents → MCP Servers feature or programmatically with the Management API `/api/v2/connections` endpoint.

After the Auth0 MCP connection has been created, navigate to the connection's settings view and select the Applications tab. Make sure to enable the Auth0 application that you created in the [Getting started](#-getting-started) section.

Ensure the `SLACK_MCP_SERVER` connection value in `src/integrations/mcp/servers.ts` matches your Auth0 Slack MCP connection's name, example:

```
export const SLACK_MCP_SERVER: McpServerConfig = {
  connection: 'slack',
  url: 'https://mcp.slack.com/mcp',
  scopes: [],
};
```

### Jira

Jira's MCP server (`https://mcp.atlassian.com/v1/mcp/authv2`) supports Dynamic Client Registration (DCR), so no Atlassian OAuth app needs to be created by hand.

**Before you start:** You need an Atlassian account with at least one Jira site. The Rovo MCP Server requires site access to authorize. Also, your Auth0 callback URL must be allowlisted. Complete step 4 below before attempting the OAuth flow, or you will see a "Your organization admin must authorize access from this redirect URL" error.

**1. Register an OAuth client with Atlassian via DCR:**

```bash
curl --request POST \
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

**2. Get a Management API access token**. See the Notion section above for instructions.

**3. Create the Auth0 connection** using the Management API with the `client_id` from step 1. The connection can also be created via the dashboard Agents → MCP Servers feature or programmatically with the Management API `/api/v2/connections` endpoint.

After the Auth0 MCP connection has been created, navigate to the connection's settings view and select the Applications tab. Make sure to enable the Auth0 application that you created in the [Getting started](#-getting-started) section.

Ensure the `ATLASSIAN_JIRA_MCP_SERVER` connection value in `src/integrations/mcp/servers.ts` matches your Auth0 Jira MCP connection's name, example:

```
export const ATLASSIAN_JIRA_MCP_SERVER: McpServerConfig = {
  connection: 'jira',
  url: 'https://mcp.atlassian.com/v1/mcp/authv2',
  scopes: [],
};
```

**4. Allowlist your Auth0 callback domain in Atlassian:**

The Atlassian Rovo MCP Server requires explicit domain approval before any OAuth client can complete the authorization flow. Log in to [admin.atlassian.com](https://admin.atlassian.com), navigate to your site's **Rovo MCP Server settings** → **Your domains**, and add `https://YOUR_AUTH0_DOMAIN/login/callback`.


### Confluence

Confluence's MCP server (`https://mcp.atlassian.com/v1/mcp/authv2`) supports Dynamic Client Registration (DCR), so no Atlassian OAuth app needs to be created by hand.

**Before you start:** You need an Atlassian account with at least one Confluence site. The Rovo MCP Server requires site access to authorize. Also, your Auth0 callback URL must be allowlisted. Complete step 4 below before attempting the OAuth flow, or you will see a "Your organization admin must authorize access from this redirect URL" error.

**1. Register an OAuth client with Atlassian via DCR:**

```bash
curl --request POST \
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

**2. Get a Management API access token**. See the Notion section above for instructions.

**3. Create the Auth0 connection** using the Management API with the `client_id` from step 1. The connection can also be created via the dashboard Agents → MCP Servers feature or programmatically with the Management API `/api/v2/connections` endpoint.

After the Auth0 MCP connection has been created, navigate to the connection's settings view and select the Applications tab. Make sure to enable the Auth0 application that you created in the [Getting started](#-getting-started) section.

Ensure the `ATLASSIAN_CONFLUENCE_MCP_SERVER` connection value in `src/integrations/mcp/servers.ts` matches your Auth0 Confluence MCP connection's name, example:

```
export const ATLASSIAN_CONFLUENCE_MCP_SERVER: McpServerConfig = {
  connection: 'confluence',
  url: 'https://mcp.atlassian.com/v1/mcp/authv2',
  scopes: [],
};
```

**4. Allowlist your Auth0 callback domain in Atlassian:**

The Atlassian Rovo MCP Server requires explicit domain approval before any OAuth client can complete the authorization flow. Log in to [admin.atlassian.com](https://admin.atlassian.com), navigate to your site's **Rovo MCP Server settings** → **Your domains**, and add `https://YOUR_AUTH0_DOMAIN/login/callback`.


### HubSpot

**1. Create an MCP auth app in HubSpot** by following the [HubSpot MCP server integration guide](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server). Set the redirect URL to `https://YOUR_AUTH0_DOMAIN/login/callback`. Note the **Client ID** and **Client Secret**.

**2. Get a Management API access token**. See the Notion section above for instructions.

**3. Create the Auth0 connection** using the Management API with your HubSpot credentials. The connection can also be created via the dashboard Agents → MCP Servers feature or programmatically with the Management API `/api/v2/connections` endpoint.

After the Auth0 MCP connection has been created, navigate to the connection's settings view and select the Applications tab. Make sure to enable the Auth0 application that you created in the [Getting started](#-getting-started) section.

Ensure the `HUBSPOT_MCP_SERVER` connection value in `src/integrations/mcp/servers.ts` matches your Auth0 HubSpot MCP connection's name, example:

```
export const HUBSPOT_MCP_SERVER: McpServerConfig = {
  connection: 'hubspot',
  url: 'https://mcp.hubspot.com',
  scopes: [],
};
```

Note: HubSpot's token endpoint requires `token_endpoint_auth_method: "client_secret_post"` — the Auth0 default of `client_secret_basic` will fail.


### Asana

Asana's MCP server (`https://mcp.asana.com/v2/mcp`) requires a manually-registered OAuth app. Asana does not support Dynamic Client Registration for non-localhost redirect URIs, so you must register an app by hand.

**1. Create an OAuth app in Asana:**

Go to [app.asana.com/0/my-apps](https://app.asana.com/0/my-apps) → **Create new app** → choose **MCP app**.

Under the **OAuth** section of the app:
- Add your Auth0 callback URL as a redirect URI: `https://YOUR_AUTH0_DOMAIN/login/callback`

Note the **Client ID** and **Client Secret**.

**2. Get a Management API access token**. See the Notion section above for instructions.

**3. Create the Auth0 connection** using the Management API with your Asana credentials. The connection can also be created via the dashboard Agents → MCP Servers feature or programmatically with the Management API `/api/v2/connections` endpoint.

After the Auth0 MCP connection has been created, navigate to the connection's settings view and select the Applications tab. Make sure to enable the Auth0 application that you created in the [Getting started](#-getting-started) section.

Ensure the `ASANA_MCP_SERVER` connection value in `src/integrations/mcp/servers.ts` matches your Auth0 Asana MCP connection's name, example:

```
export const ASANA_MCP_SERVER: McpServerConfig = {
  connection: 'asana',
  url: 'https://mcp.asana.com/v2/mcp',
  scopes: ['default'],
};
```

Note: PKCE must be enabled even with a client secret. Use Asana's main OAuth endpoints (`app.asana.com`), not the MCP server endpoints (`mcp.asana.com`).


### Linear

Linear's MCP server (`https://mcp.linear.app/mcp`) has no built-in Auth0 social connection, so it is added as a **Custom OAuth2 connection** (`strategy: "oauth2"`). Linear supports Dynamic Client Registration (DCR), so no Linear OAuth app needs to be created by hand.

**1. Register an OAuth client with Linear via DCR:**

```bash
curl --request POST \
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

Note the `client_id` from the response. `token_endpoint_auth_method: "none"` makes it a **public client**. PKCE secures the code exchange instead of a client secret.

**2. Get a Management API access token**. See the Notion section above for instructions.

**3. Create the Auth0 connection** using the Management API with the `client_id` from step 1. The connection can also be created via the dashboard Agents → MCP Servers feature or programmatically with the Management API `/api/v2/connections` endpoint.

After the Auth0 MCP connection has been created, navigate to the connection's settings view and select the Applications tab. Make sure to enable the Auth0 application that you created in the [Getting started](#-getting-started) section.

Ensure the `LINEAR_MCP_SERVER` connection value in `src/integrations/mcp/servers.ts` matches your Auth0 Linear MCP connection's name, example:

```
export const LINEAR_MCP_SERVER: McpServerConfig = {
  connection: 'linear',
  url: 'https://mcp.linear.app/mcp',
  scopes: ['read'],
};
```

### Sentry

Sentry's MCP server (`https://mcp.sentry.dev/mcp`) supports Dynamic Client Registration (DCR), so no Sentry app needs to be created by hand.

**1. Register an OAuth client with Sentry via DCR:**

```bash
curl --request POST \
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

**2. Get a Management API access token**. See the Notion section above for instructions.

**3. Create the Auth0 connection** using the Management API with the `client_id` from step 1, setting the scope to match your use case (e.g. `org:read project:write team:write event:write`). The connection can also be created via the dashboard Agents → MCP Servers feature or programmatically with the Management API `/api/v2/connections` endpoint.

After the Auth0 MCP connection has been created, navigate to the connection's settings view and select the Applications tab. Make sure to enable the Auth0 application that you created in the [Getting started](#-getting-started) section.

Ensure the `SENTRY_MCP_SERVER` connection value in `src/integrations/mcp/servers.ts` matches your Auth0 Sentry MCP connection's name, example:

```
export const SENTRY_MCP_SERVER: McpServerConfig = {
  connection: 'sentry',
  url: 'https://mcp.sentry.dev/mcp',
  scopes: ['org:read', 'project:write', 'team:write', 'event:write'],
};
```

### Cloudflare

Cloudflare's MCP server (`https://mcp.cloudflare.com/mcp`) supports Dynamic Client Registration (DCR), so no Cloudflare app needs to be created by hand.

**1. Register an OAuth client with Cloudflare via DCR:**

```bash
curl --request POST \
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

**2. Get a Management API access token**. See the Notion section above for instructions.

**3. Create the Auth0 connection** using the Management API with the `client_id` from step 1. The connection can also be created via the dashboard Agents → MCP Servers feature or programmatically with the Management API `/api/v2/connections` endpoint.

After the Auth0 MCP connection has been created, navigate to the connection's settings view and select the Applications tab. Make sure to enable the Auth0 application that you created in the [Getting started](#-getting-started) section.

Ensure the `CLOUDFLARE_MCP_SERVER` connection value in `src/integrations/mcp/servers.ts` matches your Auth0 Cloudflare MCP connection's name, example:

```
export const CLOUDFLARE_MCP_SERVER: McpServerConfig = {
  connection: 'cloudflare',
  url: 'https://mcp.cloudflare.com/mcp',
  scopes: [],
};
```

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
