# Example MCP Server with Auth0 Integration

This example shows how to secure an MCP server with Auth0 using the [`auth0-ai-mcp`](https://github.com/auth0/auth0-ai-python/tree/main/packages/auth0-ai-mcp) package and the official MCP Python SDK. The package verifies access tokens, publishes the OAuth protected resource metadata that MCP clients use to find Auth0, and checks scopes for each tool.

## Available Tools

The server exposes the following tools:

- `whoami` - Returns the authenticated caller and granted scopes (requires the `tool:whoami` scope)
- `greet` - Personalized greeting demonstrating authenticated tool access (requires the `tool:greet` scope)
- `get_datetime` - Returns the current UTC date and time (no scope required)

## Install dependencies

```
poetry install
```

## Auth0 Tenant Setup

For detailed instructions on setting up your Auth0 tenant for MCP server integration, please refer to the [Auth0 Tenant Setup guide](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/fastmcp-mcp-js/README.md#auth0-tenant-setup) in the FastMCP example.

## Configuration

Rename `.env.example` to `.env` and configure the domain and audience:

```
# Auth0 tenant domain
AUTH0_DOMAIN=example-tenant.us.auth0.com

# Auth0 API Identifier, must match your Auth0 API exactly including the trailing slash
AUTH0_AUDIENCE=http://localhost:3001/
```

With the configuration in place, the example can be started by running:

```bash
poetry run python -m src.server
```

The server listens at `http://localhost:3001/`.

## Testing

Use an MCP client like [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test your server interactively:

```bash
npx @modelcontextprotocol/inspector
```

The server will start up and the UI will be accessible at http://localhost:6274.

In the MCP Inspector, select `Streamable HTTP` as the `Transport Type`, enter `http://localhost:3001/` as the URL, and select `Via Proxy` for `Connection Type`.

### Using cURL

You can use cURL to verify that the server is running:

```bash
# A request with no token returns 401 and a WWW-Authenticate header
curl -i -X POST http://localhost:3001/ -H "Content-Type: application/json" -d '{}'

# Check the OAuth resource metadata
curl -v http://localhost:3001/.well-known/oauth-protected-resource

# Test MCP initialization (requires valid Auth0 access token)
curl -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "curl-test", "version": "1.0.0"}}}'
```

**Note:** Use the MCP Inspector or other MCP-compatible clients for comprehensive testing.
