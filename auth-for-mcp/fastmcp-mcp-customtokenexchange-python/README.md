# Example MCP Server with Auth0 for Custom Token Exchange (Python)

This example shows how an MCP server can call a downstream API on behalf of the signed-in user using Custom Token Exchange. It uses the [`auth0-ai-mcp`](https://github.com/auth0/auth0-ai-python/tree/main/packages/auth0-ai-mcp) package with the official MCP Python SDK. The package verifies the caller's access token, publishes the OAuth protected resource metadata that MCP clients use to find Auth0, and checks scopes for each tool. The token exchange call itself comes from the underlying [`auth0-api-python`](https://github.com/auth0/auth0-api-python) client.

## Available Tools

The server exposes the following tools:

- `whoami` - Returns authenticated user information and granted scopes
- `greet` - Personalized greeting demonstrating Custom Token Exchange with an upstream API
- `get_datetime` - Returns the current UTC date and time (no scope required)

## Install dependencies

Install the dependencies using Poetry:

```bash
poetry install
```

## Auth0 Tenant Setup

Follow the [Auth0 Tenant Setup guide](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/fastmcp-mcp-js/README.md#auth0-tenant-setup) in the FastMCP example to create the MCP server API (`http://localhost:3001/`) with the `tool:greet` and `tool:whoami` permissions. Then set up the token exchange:

1. Create an API for the upstream service with the identifier `http://localhost:8787/` and a `read:private` permission.
2. Create a Custom Token Exchange Action (trigger `custom-token-exchange`) that verifies the subject token and sets the user. Add the `jose` dependency and two secrets, `AUTH0_DOMAIN` (your tenant domain) and `MCP_AUDIENCE` (`http://localhost:3001/`), then deploy it:

   ```js
   const { createRemoteJWKSet, jwtVerify } = require('jose');

   exports.onExecuteCustomTokenExchange = async (event, api) => {
     const issuer = `https://${event.secrets.AUTH0_DOMAIN}/`;
     const jwks = createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`));

     let payload;
     try {
       ({ payload } = await jwtVerify(event.transaction.subject_token, jwks, {
         issuer,
         audience: event.secrets.MCP_AUDIENCE,
       }));
     } catch (err) {
       api.access.rejectInvalidSubjectToken('Invalid subject token');
       return;
     }

     api.authentication.setUserById(payload.sub);
   };
   ```

3. Create a Token Exchange Profile with the subject token type `urn:fastmcp:mcp`, type `custom_authentication`, and the Action from the previous step.
4. Create a client for your MCP server with `oidc_conformant` set to `true` and `token_exchange` set to `{"allow_any_profile_of_type": ["custom_authentication"]}`. Its client ID and secret go in `MCP_AUTH0_CLIENT_ID` and `MCP_AUTH0_CLIENT_SECRET`.
5. Create a client grant that gives that client the `read:private` scope on `http://localhost:8787/` with `subject_type` set to `user`.

## Configuration

Create a `.env` file in the project root and configure the following environment variables:

```
# Auth0 tenant domain
AUTH0_DOMAIN=example-tenant.us.auth0.com

# Auth0 API Identifier, must match your Auth0 API exactly including the trailing slash
AUTH0_AUDIENCE=http://localhost:3001/

# Server port
PORT=3001

# MCP Auth0 client credentials and configuration
MCP_AUTH0_CLIENT_ID=your-client-id
MCP_AUTH0_CLIENT_SECRET=your-client-secret

# Subject token type for CTE, must match your Token Exchange Profile
MCP_AUTH0_SUBJECT_TOKEN_TYPE=urn:fastmcp:mcp

# Scopes to request
MCP_AUTH0_EXCHANGE_SCOPE=read:private

# Upstream API configuration
API_AUTH0_AUDIENCE=http://localhost:8787/
API_BASE_URL=http://localhost:8787
```

## Services

This example consists of two services that work together:

### 1. Upstream API Service (`poetry run python -m src.api.server`)

The upstream API is a Starlette-based service that demonstrates a protected resource requiring specific scopes:

- **Port**: 8787 (configurable via `API_BASE_URL`)
- **Authentication**: Auth0 JWT tokens with `API_AUTH0_AUDIENCE`
- **Endpoints**:
  - `GET /api/private-scope` - Protected endpoint requiring `read:private` scope

The API service validates incoming tokens and returns authenticated user information including the subject (`sub`) and granted scopes.

### 2. MCP Server (`poetry run python -m src.server`)

The MCP (Model Context Protocol) server verifies access tokens and uses Custom Token Exchange to call the upstream API:

- **Port**: 3001 (configurable via `PORT`)
- **Transport**: HTTP streaming at `/` endpoint
- **Authentication**: Auth0 JWT tokens with `AUTH0_AUDIENCE`

## Running the Services

With the configuration in place, start both services:

**1. Start the upstream API:**
```bash
cd /path/to/fastmcp-mcp-customtokenexchange-python
poetry run python -m src.api.server
```

**2. Start the MCP server (in a new terminal):**
```bash
cd /path/to/fastmcp-mcp-customtokenexchange-python
poetry run python -m src.server
```

The MCP server will use Custom Token Exchange (CTE) to obtain tokens for calling the upstream API on behalf of authenticated users.

## Testing

Use an MCP client like [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test your server interactively:

```bash
npx @modelcontextprotocol/inspector
```

The server will start up and the UI will be accessible at http://localhost:6274.

In the MCP Inspector, select `Streamable HTTP` as the `Transport Type`, enter `http://localhost:3001/` as the URL, and select `Via Proxy` for `Connection Type`.

### Using cURL
You can use cURL to verify that the server is running:

```sh
# A request with no token returns 401 and a WWW-Authenticate header
curl -i -X POST http://localhost:3001/ -H "Content-Type: application/json" -d '{}'

# Check the OAuth resource metadata
curl -v http://localhost:3001/.well-known/oauth-protected-resource

# Test MCP initialization (requires valid Auth0 access token) and keep the session ID for the next calls
SESSION_ID=$(curl -s -D - -o /dev/null -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "curl-test", "version": "1.0.0"}}}' \
  | grep -i '^mcp-session-id:' | cut -d' ' -f2 | tr -d '\r')

# Test get_datetime tool (no scope required) - outputs ISO string like 2025-10-31T14:12:03.123Z
curl -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "get_datetime", "arguments": {}}}'

# Test greet tool (tool:greet permission required) - outputs Upstream API response when the CTE flow succeeds
curl -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "greet", "arguments": {"name": "World"}}}'

# sample response from greet tool:
event: message
data: {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"Hello, World (auth0|69d9483f2d2c4494f9de0d8c)!\nUpstream API Response: {\n  \"msg\": \"Hello from upstream API\",\n  \"sub\": \"auth0|69d9483f2d2c4494f9de0d8c\",\n  \"scopes\": [\n    \"read:private\"\n  ]\n}"}],"isError":false}}
```

**Note:** Use the MCP Inspector or other MCP-compatible clients for comprehensive testing.

## Custom Token Exchange Flow

This example demonstrates the following Custom Token Exchange (CTE) flow:

1. **Client authenticates** to the MCP server with an Auth0 access token
2. **MCP server validates** the token and checks the scopes the tool needs
3. **Client calls `greet` tool** on the MCP server
4. **MCP server exchanges** the original token for a new token with a different audience by calling `get_token_by_exchange_profile` on the `auth0-api-python` client:
   - Subject token: Original MCP access token
   - Subject token type: `MCP_AUTH0_SUBJECT_TOKEN_TYPE`
   - Target audience: Upstream API (`API_AUTH0_AUDIENCE`)
   - Requested scope: `read:private`
5. **MCP server calls upstream API** using the exchanged token
6. **Upstream API validates** the token and returns user information
7. **MCP server returns** the result to the client

This pattern is useful for:
- Microservices architectures where each service has its own audience
- Token scoping where different services require different permissions
- Integration with external APIs that require different token audiences
