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
