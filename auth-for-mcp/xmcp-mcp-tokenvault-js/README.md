# XMCP MCP Server with Auth0 Token Vault

This sample shows how you can use [Auth0's Token Vault](https://auth0.com/ai/docs/intro/token-vault) to call an External MCP Service or API securely, in this sample we use Google Calendar.

## Overview

When AI Agents access MCP Servers, they do so as agents authorized to access services on behalf of the user. When an MCP Server needs to call an external API, it requires credentials for that external API. To accomplish this, we use Auth0's Token Vault to obtain an `access_token` for upstream APIs just-in-time by exchanging the `access_token` for the MCP Server to securely obtain an access token for the external API, such as Google Calendar.

In this guide we leverage:

- Auth0 Universal Login for primary user authentication.
- OAuth 2.0 and OpenID Connect for issuing access tokens to your MCP server API.
- Auth0 Token Vault to access Google Calendar from your MCP Server

By the end you will have an MCP server that can:

- Let users sign up and log in with a Google account.
- Enforce tool access via scopes.
- Exchange Auth0-issued access tokens for Google Calendar tokens using Token Vault.

## When to Use This Pattern

Use this pattern when:

- **Your MCP server needs to access external APIs on behalf of users** – For example, accessing Google Calendar, Gmail, Salesforce, or any OAuth-protected API
- **Users authenticate through multiple identity providers** – Auth0 handles authorization, and [Token Vault](https://auth0.com/ai/docs/intro/token-vault) provides a unified way to access each user's connected services.
- **You're building composite AI agents** – Your MCP server aggregates data from multiple external services (calendar + email + CRM, etc.)

**Key Benefits:**

- No credential storage in your application
- Automatic token refresh for external APIs
- Secure token exchange using OAuth 2.0 standards
- Centralized audit trail of external API access

**When NOT to use this pattern:**

- Your MCP server doesn't need to access external APIs
- You're calling your own APIs

## End to End Token Vault Flow with an MCP Server

Here's how the complete flow works:

1. MCP Client (Inspector) requests authorization for the MCP Server.
2. User authorizes (and optionally authenticates with Google).
3. MCP Client receives an Auth0 access token for the MCP Server.
4. MCP Client makes an authorized request to the MCP Server with the Auth0 `access_token` to invoke the tool `calendar_summary`.
5. MCP Server calls `apiClient.getAccessTokenForConnection` with the user's access token and `google-oauth2` connection.

   Code excerpt (`src/tools/calendar_summary.ts`):

   ```typescript
   const googleTokenSet = await apiClient.getAccessTokenForConnection({
     accessToken: authInfo.token,
     connection: "google-oauth2",
   });
   ```

6. Auth0 validates the MCP Server's credentials and the `access_token`, then returns a Google access token.
7. MCP Server queries the Calendar API with the exchanged token; no Google credentials are stored locally.

## Available Tools

The server exposes the following tools:

- `whoami` – returns authenticated user and granted scopes.
- `greet` – demonstrates a scoped tool invocation.
- `get_datetime` – returns the current UTC datetime (no scope required).
- `calendar_summary` – fetches today's Google Calendar events via Token Vault token exchange.

## Prerequisites

- Node.js v20+
- An Auth0 account ([sign up](https://auth0.com/signup))
- [Auth0 Dashboard](https://manage.auth0.com/) or [Auth0 CLI](https://auth0.github.io/auth0-cli/) to make configuration changes
- Google Cloud Account to get access to Google Calendar API

## Quick Navigation

| Step                                                                                       | Description                                                               |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [1. Setup](#1-setup)                                                                       | Clone the repository and install dependencies                             |
| [2. Create or Log In to Your Auth0 Account](#2-create-or-log-in-to-your-auth0-account)     | Access the Auth0 Dashboard                                                |
| [3. Optional: Install and Set Up Auth0 CLI](#3-optional-install-and-set-up-auth0-cli)      | Set up CLI for automation (optional)                                      |
| [4. Set Up Google Connection and Token Vault](#4-set-up-google-connection-and-token-vault) | Configure Google OAuth and enable Token Vault                             |
| [5. Create the MCP Server (Resource Server)](#5-create-the-mcp-server-resource-server)     | Register your MCP API, define scopes, and create associated application   |
| [6. Update Auth0 Tenant to Allow MCP Access](#6-update-auth0-tenant-to-allow-mcp-access)   | Enable `resource` parameter, Optionally setup DCR, and a default audience |
| [7. Create Environment File](#7-create-environment-file)                                   | Configure Auth0 credentials                                               |
| [8. Run the MCP Server](#8-run-the-mcp-server)                                             | Start your server                                                         |
| [9. Connect with MCP Inspector](#9-connect-with-mcp-inspector)                             | Test with MCP Inspector                                                   |
| [10. Invoke Tools](#10-invoke-tools)                                                       | Try the tools                                                             |

---

## 1. Setup

Clone the sample repository and install dependencies:

```bash
git clone https://github.com/auth0-samples/auth0-ai-samples.git
cd auth0-ai-samples/auth-for-mcp/xmcp-with-tokenvault
npm install
```

In order to run this sample we will need environment variables from Auth0 Dashboard. In the next sections we will setup the Auth0 Tenant and obtain these variables.

## 2. Create or Log In to Your Auth0 Account

Ensure you can access the [Auth0 Dashboard](https://manage.auth0.com/). If you don't have an Auth0 Tenant, you can create one by visiting [https://auth0.com](https://auth0.com) and clicking on "Sign Up".

## 3. Optional: Install and Set Up Auth0 CLI

You can leverage the Auth0 CLI to make changes to the Auth0 Tenant. This guide offers both the one line CLI commands and detailed dashboard steps. You can skip this step if you prefer only the Dashboard.

[Install the CLI](https://github.com/auth0/auth0-cli?tab=readme-ov-file#installation), then authenticate requesting required scopes:

```bash
auth0 login --scopes "read:client_grants,create:client_grants,delete:client_grants,read:clients,create:clients,update:clients,read:resource_servers,create:resource_servers,update:resource_servers,read:roles,create:roles,update:roles,update:tenant_settings,read:connections,update:connections"
```

Verify the tenant:

```bash
auth0 tenants list
```

You should see your tenant domain listed and selected.

## 4. Set Up Google Connection and Token Vault

For this guide, users will use Google to authenticate and authorize access to their calendar. In order to do this, we need:

- Google Connection to be configured in Auth0
- Token Vault enabled on the Google Connection
- Google Connection to be promoted to domain level

### 4.1 Configure a Google Connection in Auth0

In order to access the user's Google Calendar, your service needs to request access to the user's Google Account. This process leverages the "Sign in with Google" experience using the OAuth 2.0 authorization code flow with Google. In short:

1. Your application requests `calendar` authorization from a Google Account.
2. Google displays a consent screen to the user, including a summary of your project, its policies, and the requested access scopes.
3. The user grants consent and Auth0 obtains authorization from Google.

To configure and enable the Google Connection please refer to our detailed [Google Integration Guide](https://auth0.com/ai/docs/integrations/google).

### 4.2 Request Access to Calendar

Once you have set up the Google connection and enabled Token Vault, you can request access to the Calendar API.

![Auth0 Dashboard Screenshot with Calendar Enabled in Requested scopes](./screenshots/request-calendar-scope.png)

### 4.3 Promote Google Connection to Domain Level

MCP clients are [third-party agents](https://auth0.com/docs/get-started/applications/confidential-and-public-applications/enable-third-party-applications) that request access to your service on the user's behalf. By default, a connection in Auth0 is allowed for all first-party applications but not for third parties. To allow users to connect to the MCP Server using Sign in with Google, we will promote the Google connection to domain level.

<details>
<summary>Promote to Domain Connection Using Auth0 CLI</summary>
List connections:

```bash
auth0 api get connections
```

Identify the Google Connection (strategy `google-oauth2`) for social login and Calendar access.

Promote the connection (replace `YOUR_CONNECTION_ID`):

```bash
auth0 api patch connections/YOUR_CONNECTION_ID --data '{"is_domain_connection": true}'
```

</details>

Dashboard steps:

- Visit the Auth0 Dashboard
- Navigate to Connections > Social
- Click on the Google Connection you created earlier
- Scroll to the bottom and enable "Promote Connection to Domain Level"

![Auth0 Dashboard Screenshot with Promote Connections to Domain Level](./screenshots/promote-connections-to-domain-level.png)

## 5. Create the MCP Server (Resource Server)

MCP servers are OAuth 2.0 resource servers. In order for your AI agents to request access to them via Auth0, they need to be registered in the Auth0 tenant.

<details>
<summary>Register an MCP Server and Create Scopes using Auth0 CLI</summary>

```bash
auth0 apis create \
    --name "MCP Server" \
    --identifier "http://localhost:3001/mcp" \
    --signing-alg "RS256" \
    --scopes "tool:whoami,tool:greet,tool:calendar_summary"
```

</details>

To create a new MCP Server in the Auth0 Dashboard:

- Visit the Auth0 Dashboard
- Navigate to Applications > API
- Click on Create New API

![Create new API Modal](./screenshots/create-new-api.png)

In the modal, fill in the following details:

- Name: MCP Server
- Identifier: http://localhost:3001/mcp

You can leave the other configuration as default.

### 5.1 Create Scopes

Tools are **public by default**. Any authenticated user can access them.

To make a tool private, add a `tool:<tool-name>` permission in your Auth0 API settings.

1. **Check if permission exists** → queries `read:resource_servers` to see if `tool:<name>` is defined
2. **If permission exists** → queries `read:users` to verify the user has it assigned
3. **If permission does not exist** → tool is public, any authenticated user can access

> **Note**: If Management API calls fail, the secure default is to deny access. This ensures real-time permission verification rather than relying on potentially stale token claims.

Define the following scopes:

- **Name:** `tool:whoami`
- **Description:** "Get user information"
- **Name:** `tool:greet`
- **Description:** "Greet the user"
- **Name:** `tool:calendar_summary`
- **Description:** "Get a summary of the user's calendar"

Once all of the scopes are created, your API is ready to use.

![Auth0 API with Scopes Created](./screenshots/scopes-created.png)

### 5.2 Create an MCP Server Associated Application to Obtain Google Access Tokens

In order to obtain Google Access Tokens using Token Vault, we need to request credentials so that the MCP Server can identify itself securely.

<details>
<summary>Create an Associated Application using Auth0 CLI</summary>

```bash
auth0 apps create --name "MCP Server" --type resource_server --resource-server-identifier "http://localhost:3001/mcp"
```

</details>

To create an associated application in the Auth0 Dashboard:

- Visit the Auth0 Dashboard
- Go to Applications > APIs
- Find the Resource Server you created earlier ("MCP Server")
- On the top right-hand side of the page, click on "+Add Application"
- You can pick a name for this application or leave it as the default
- Click Create

![Create Associated Application in Auth0 Dashboard](./screenshots/create-associated-application.png)

This creates a new application of the special type "resource server"; this application is always linked to your MCP Server.

Note the `client_id` and `client_secret` for this application. You will need these for configuration.

#### 5.2.1 Enable Google Connection for this MCP Server Application

As a last step, grant the MCP Server application access to the user's Google tokens in Token Vault. This can be done by visiting the "Connections" tab of the newly created application.

![Enable Google Connection](./screenshots/enable-google-access.png)

Docs: https://auth0.com/docs/secure/tokens/token-vault/configure-access-token-exchange-with-token-vault

## 6. Update Auth0 Tenant to Allow MCP Access

These settings affect the entire tenant and enable MCP clients to authenticate and access your MCP server.

### 6.1 Enable Resource Parameter Compatibility Profile

The Model Context Protocol (MCP) specification uses the standards-compliant `resource` parameter (RFC 8707). Auth0 historically used `audience`. Enabling this compatibility profile allows clients to send `resource` instead of (or alongside) `audience`.

Enable via Dashboard:

1. Navigate to Settings > Advanced.
2. Under Settings, enable **Resource Parameter Compatibility Profile**.

![Enable Resource Parameter in Dashboard](./screenshots/resource-param.png)

<details>
<summary>Show CLI command</summary>

```bash
auth0 tenant-settings update set flags.enable_resource_server_identifier
```

</details>

If you choose not to enable this, set a default audience (see 6.3) so requests without `audience` still obtain tokens for your MCP Server.

### 6.2 Enable Dynamic Client Registration

Dynamic Client Registration (DCR) allows third-party MCP clients (e.g., MCP Inspector) to register automatically. This is required if you want your MCP Server to be accessible to all MCP clients to authenticate with your server. Instead, if you are targeting a select set of trusted partners, or, if you are building MCP Servers that will only be used by your own Agents. You do not need to enable DCR.

Dashboard:

1. Navigate to Settings > Advanced.
2. Enable **Dynamic Client Registration**.

![Dashboard with DCR Enabled](./screenshots/enable-dcr.png)

<details>
<summary>Show CLI command</summary>

```bash
auth0 tenant-settings update set flags.enable_dynamic_client_registration
```

</details>

### 6.3 Set Default Audience (Fallback)

Configure a default audience for clients that send neither `audience` nor `resource`.

Enable via Dashboard:

1. Navigate to Settings
2. Scroll to "API Authorization Settings"
3. Under "Default Audience" set `http://localhost:3001/mcp`.

![Set Default Audience](./screenshots/default-audience.png)

<details>
<summary>Show CLI command</summary>

```bash
auth0 api patch tenants/settings --data '{"default_audience": "http://localhost:3001/mcp"}'
```

</details>

## 7. Create Environment File

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=http://localhost:3001/mcp
AUTH0_CLIENT_ID=YOUR_BACKEND_APP_CLIENT_ID

# Auth0 Client Secret for the Associated Client
AUTH0_CLIENT_SECRET=YOUR_BACKEND_APP_CLIENT_SECRET

# Or use private key JWT instead of client secret:
# AUTH0_CLIENT_ASSERTION_SIGNING_ALG=RS256
# AUTH0_CLIENT_ASSERTION_SIGNING_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
PORT=3001
MCP_SERVER_URL=http://localhost:3001
```

## 8. Run the MCP Server

You can start the development server by running:

```bash
npm run dev
```

The server runs at `http://localhost:3001`.

## 9. Connect with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

**Notes:**

- Because DCR is enabled, MCP Inspector creates a new application each run (no reuse/caching).

In MCP Inspector:

1. **Transport Type:** Streamable HTTP
2. **URL:** `http://localhost:3001/mcp`
3. Open Auth Settings > Quick OAuth Flow
4. Complete Universal Login
5. Consent to requested scopes
6. List Tools

### Using cURL

You can use cURL to verify that the server is running:

```bash
# Test that the server is running and accessible - check OAuth resource metadata
curl -v http://localhost:3001/.well-known/oauth-protected-resource

# Test MCP initialization (requires valid Auth0 access token)
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "curl-test", "version": "1.0.0"}}}'

# Test get_datetime tool (no scope required) - outputs ISO string like 2025-10-31T14:12:03.123Z
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "get_datetime", "arguments": {}}}'
```

## 10. Invoke Tools

Select a tool and execute:

- **`whoami`** – Confirms identity, scopes, and subject.
- **`greet`** – Demonstrates scoped execution.
- **`get_datetime`** – Returns current UTC datetime (no scope required).
- **`calendar_summary`** – Triggers Token Vault exchange, then queries Google Calendar.

## Reference Documentation

- Model Context Protocol: https://modelcontextprotocol.io/docs
- XMCP Framework: https://xmcp.dev/
- Auth0 Dynamic Client Registration: https://auth0.com/docs/get-started/applications/dynamic-client-registration
- Auth0 Token Vault: https://auth0.com/docs/secure/tokens/token-vault
- Access Token Exchange: https://auth0.com/docs/secure/tokens/token-vault/access-token-exchange-with-token-vault
- Google Social Connection: https://auth0.com/docs/authenticate/identity-providers/social-identity-providers/google
