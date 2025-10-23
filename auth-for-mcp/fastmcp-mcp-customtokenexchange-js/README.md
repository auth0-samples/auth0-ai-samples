# Example FastMCP MCP Server with Auth0 for Custom Token Exchange

## Install dependencies

Install the dependencies using npm:

```bash
npm install
```

## Configuration

Rename `.env.example` to `.env` and configure the following environment variables:

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
MCP_AUTH0_EXCHANGE_SCOPE=read:tasks

# Upstream API configuration
API_AUTH0_AUDIENCE=your-api-audience
API_BASE_URL=http://localhost:8787
```

## Services

This example consists of two services that work together:

### 1. Upstream API Service (`npm run start:api`)

The upstream API is a Fastify-based service that demonstrates a protected resource requiring specific scopes:

- **Port**: 8787 (configurable via `API_BASE_URL`)
- **Authentication**: Auth0 JWT tokens with `API_AUTH0_AUDIENCE`
- **Endpoints**:
  - `GET /api/private-scope` - Protected endpoint requiring `read:private` scope

The API service validates incoming tokens and returns authenticated user information including the subject (`sub`) and granted scopes.

### 2. MCP Server (`npm run start`)

The MCP (Model Context Protocol) server implements custom token exchange with Auth0:

- **Port**: 3001 (configurable via `PORT`)
- **Transport**: HTTP streaming at `/mcp` endpoint
- **Authentication**: Auth0 JWT tokens with `AUTH0_AUDIENCE`
- **Available Tools**:
  - `greet` - Personalized greeting with Custom Token Exchange demo that calls the upstream API
  - `whoami` - Returns authenticated user details and scopes

## Running the Services

With the configuration in place, start both services:

**1. Start the upstream API:**
```bash
npm run start:api
```

**2. Start the MCP server:**
```bash
npm run start
```

The MCP server will use Custom Token Exchange (CTE) to obtain tokens for calling the upstream API on behalf of authenticated users.

## Testing

Use an MCP client like [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test your server interactively:

```bash
npx @modelcontextprotocol/inspector
```

The server will start up and the UI will be accessible at http://localhost:6274.

In the MCP Inspector, select `Streamable HTTP` as the `Transport Type`, enter `http://localhost:3001/mcp` as the URL, and select `Via Proxy` for `Connection Type`.
