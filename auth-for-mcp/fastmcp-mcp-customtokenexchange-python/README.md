# Example FastMCP MCP Server with Auth0 for Custom Token Exchange (Python)

## Install dependencies

Install the dependencies using Poetry:

```bash
poetry install
```

## Configuration

Create a `.env` file in the project root and configure the following environment variables:

```
# Auth0 tenant domain
AUTH0_DOMAIN=example-tenant.us.auth0.com

# Auth0 API Identifier
AUTH0_AUDIENCE=http://localhost:3001/

# Server port
PORT=3001

# MCP server URL
MCP_SERVER_URL=http://localhost:3001

# MCP Auth0 client credentials and configuration
MCP_AUTH0_CLIENT_ID=your-client-id
MCP_AUTH0_CLIENT_SECRET=your-client-secret

# Subject token type for CTE
MCP_AUTH0_SUBJECT_TOKEN_TYPE=urn:fastmcp:mcp

# Scopes to request
MCP_AUTH0_EXCHANGE_SCOPE=read:private

# Upstream API configuration
API_AUTH0_AUDIENCE=your-api-audience
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

The MCP (Model Context Protocol) server implements custom token exchange with Auth0:

- **Port**: 3001 (configurable via `PORT`)
- **Transport**: HTTP streaming at `/` endpoint
- **Authentication**: Auth0 JWT tokens with `AUTH0_AUDIENCE`
- **Available Tools**:
  - `greet` - Personalized greeting with Custom Token Exchange demo that calls the upstream API
  - `whoami` - Returns authenticated user details and scopes

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

## Custom Token Exchange Flow

This example demonstrates the following Custom Token Exchange (CTE) flow:

1. **Client authenticates** to the MCP server with an Auth0 access token
2. **MCP server validates** the token and creates a session
3. **Client calls `greet` tool** on the MCP server
4. **MCP server exchanges** the original token for a new token with different audience:
   - Subject token: Original MCP access token
   - Target audience: Upstream API (`API_AUTH0_AUDIENCE`)
   - Requested scope: `read:private`
5. **MCP server calls upstream API** using the exchanged token
6. **Upstream API validates** the token and returns user information
7. **MCP server returns** the result to the client

This pattern is useful for:
- Microservices architectures where each service has its own audience
- Token scoping where different services require different permissions
- Integration with external APIs that require different token audiences
