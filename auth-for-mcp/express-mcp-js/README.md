# Example Express MCP Server with Auth0 Integration

The smallest way to secure a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs) server
with Auth0 using Express. One `createNodeMcpHandler` call from [`@auth0/ai-mcp`](https://github.com/auth0/auth0-ai-js/tree/main/packages/ai-mcp) verifies the access token on every request,
answers a missing or invalid token with a `WWW-Authenticate` challenge, and serves the protected resource metadata. The server uses the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`).

For scope enforcement, on-behalf-of token exchange and a downstream API, see the full samples [`ai-mcp-js`](../ai-mcp-js) and [`ai-fastmcp-js`](../ai-fastmcp-js).

Node.js 20 or later is required.

## Available Tools

The server exposes the following tools:

- `whoami` - Returns authenticated user information and granted scopes (scope `tool:whoami`)
- `greet` - Personalized greeting demonstrating authenticated tool access (scope `tool:greet`)
- `get_datetime` - Returns the current UTC date and time (no scope required)

## Install dependencies

Install the dependencies using npm:

```bash
npm install
```

## Auth0 Tenant Setup

For detailed instructions on setting up your Auth0 tenant for MCP server integration, please refer to the [Auth0 Tenant Setup guide](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/fastmcp-mcp-js/README.md#auth0-tenant-setup) in the FastMCP example. Use `http://localhost:3001/mcp` instead of `http://localhost:3001/` as the API identifier in every step, because this server's public URL ends in `/mcp`.

## Configuration

Copy `.env.example` to `.env` and configure the domain and audience:

```
# Auth0 tenant domain
AUTH0_DOMAIN=your-tenant.us.auth0.com

# Auth0 API Identifier, which is also the public MCP URL
AUTH0_AUDIENCE=http://localhost:3001/mcp
```

The API identifier you create in your tenant must equal `AUTH0_AUDIENCE` exactly. This sample does not exchange tokens, so it needs no client id or secret.

With the configuration in place, the example can be started by running:

```bash
npm run start
```

## Testing

Use an MCP client like [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test your server interactively:

```bash
npx @modelcontextprotocol/inspector
```

The server will start up and the UI will be accessible at http://localhost:6274.

In the MCP Inspector, select `Streamable HTTP` as the `Transport Type`, enter `http://localhost:3001/mcp` as the URL, and select `Via Proxy` for `Connection Type`.

### Using cURL

You can use cURL to verify that the server is running:

```bash
# A request without a token is answered with 401 and a WWW-Authenticate header that carries resource_metadata
curl -si http://localhost:3001/mcp

# Check the OAuth protected resource metadata
curl -v http://localhost:3001/.well-known/oauth-protected-resource/mcp

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

## Check

```bash
npm run type-check
npm test
```

`npm test` starts the server with placeholder settings and checks the 401 challenge and the metadata document. It makes no call to Auth0.
