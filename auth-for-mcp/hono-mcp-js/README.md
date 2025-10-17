# Example Hono MCP Server with Auth0 Integration

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs) server with Auth0 built for [Cloudflare Workers](https://developers.cloudflare.com/workers/) using [Hono](https://hono.dev/).

## Install dependencies

Install the dependencies using npm:

```bash
npm install
```

## Auth0 Tenant Setup

For detailed instructions on setting up your Auth0 tenant for MCP server integration, please refer to the [Auth0 Tenant Setup guide](../fastmcp-mcp-js/README.md#auth0-tenant-setup).

## Configuration

Update `wrangler.toml` to configure the domain and audience:

```toml
[vars]
AUTH0_DOMAIN = "example-tenant.us.auth0.com"
AUTH0_AUDIENCE = "http://localhost:3001"
MCP_SERVER_URL = "http://localhost:3001"
```

With the configuration in place, the example can be started by running:

```bash
npm run dev
```

## Testing

Use an MCP client like [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test your server interactively:

```bash
npx @modelcontextprotocol/inspector
```

The server will start up and the UI will be accessible at http://localhost:6274.

In the MCP Inspector, select `Streamable HTTP` as the `Transport Type` and enter `http://localhost:3001/mcp` as the URL.