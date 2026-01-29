# Example XMCP MCP Server with Auth0 Integration

This is a practical example of securing a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs) server
with Auth0 using the [XMCP](https://xmcp.dev/) framework and the official [@xmcp-dev/auth0](https://xmcp.dev/docs/integrations/auth0) plugin.

## Available Tools

The server exposes the following tools:

- `whoami` - Returns authenticated user information and granted scopes
- `greet` - Personalized greeting demonstrating authenticated tool access
- `get_datetime` - Returns the current UTC date and time (no scope required)

## Install dependencies

Install the dependencies using npm:

```bash
npm install
```

## Auth0 Tenant Setup

The `@xmcp-dev/auth0` plugin requires the following Auth0 configuration:

1. **Enable Dynamic Client Registration**: In Auth0 Dashboard → Settings → Advanced, enable "OIDC Dynamic Application Registration"
2. **Enable Resource Parameter Support**: In the same location, activate "Resource Parameter Compatibility Profile"
3. **Promote Database Connection**: Promote your database connection to work with third-party clients
4. **Create API Resource**: Create an API resource with an identifier matching your server URL
5. **Set Default Audience**: Set the API identifier as the default audience in general settings
6. **Create M2M Application**: Create a machine-to-machine application and save its Domain, Client ID, and Client Secret

For detailed instructions, see the [xMCP Auth0 Integration guide](https://xmcp.dev/docs/integrations/auth0).

## Configuration

Rename `.env.example` to `.env` and configure the following environment variables:

```bash
# Auth0 tenant domain (format: <tenant>.<region>.auth0.com)
DOMAIN=example-tenant.us.auth0.com

# API identifier URL (must match the API resource created in Auth0)
AUDIENCE=http://localhost:3001/mcp

# MCP server base URL
BASE_URL=http://localhost:3001

# Machine-to-machine application credentials
CLIENT_ID=your_m2m_client_id
CLIENT_SECRET=your_m2m_client_secret
```

## Permission Enforcement

Tools are **public by default**. Any authenticated user can access them.

To make a tool private, add a `tool:<tool-name>` permission in your Auth0 API settings:

1. Go to **Auth0 Dashboard** → **Applications** → **APIs** → Your API
2. Go to **Permissions** tab
3. Add permission: `tool:greet` (for a tool named "greet")
4. Assign the permission to users who should have access

The Auth0 xmcp plugin queries Auth0 Management API on each request:

1. **Check if permission exists** → queries `read:resource_servers` to see if `tool:<name>` is defined
2. **If permission exists** → queries `read:users` to verify the user has it assigned
3. **If permission does not exist** → tool is public, any authenticated user can access

> **Note**: If Management API calls fail, the secure default is to deny access. This ensures real-time permission verification rather than relying on potentially stale token claims.

## Running the Server

For development with hot reload:

```bash
npm run dev
```

Or build and run in production mode:

```bash
npm run build
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
