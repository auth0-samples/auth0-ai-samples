# Example XMCP MCP Server with Auth0 Integration

This is a practical example of securing a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs) server
with Auth0 using the [XMCP](https://xmcp.dev/) framework.

## Install dependencies

Install the dependencies using npm:

```bash
npm install
```

## Auth0 Tenant Setup

For detailed instructions on setting up your Auth0 tenant for MCP server integration, please refer to the [Auth0 Tenant Setup guide](../fastmcp-mcp-js/README.md#auth0-tenant-setup) in the FastMCP example.

## Configuration

Rename `.env.example` to `.env` and configure the domain and audience:

```
# Auth0 tenant domain
AUTH0_DOMAIN=example-tenant.us.auth0.com
# Auth0 API Identifier
AUTH0_AUDIENCE=http://localhost:3001/
```

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

In the MCP Inspector, select `Streamable HTTP` as the `Transport Type` and enter `http://localhost:3001` as the URL.
