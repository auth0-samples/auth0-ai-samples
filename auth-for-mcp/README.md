# Auth For MCP

### Examples

Explore the following examples demonstrating the integration of **Auth0** with Model Context Protocol (MCP) servers:

- **MCP TypeScript SDK + Auth0 MCP SDK (JavaScript):**
   A store assistant MCP server built on the MCP TypeScript SDK v2 and `@auth0/ai-mcp`. It verifies access tokens, enforces tool scopes, and calls downstream APIs on behalf of the signed-in user (on-behalf-of token exchange) or as itself (client credentials).
   [View Example](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/ai-mcp-js) | [Starter (without Auth0)](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/ai-mcp-js-starter)

- **FastMCP + Auth0 MCP SDK (JavaScript):**
   An orders assistant MCP server built on FastMCP and `@auth0/ai-fastmcp`. It verifies access tokens, enforces tool scopes, and calls an orders API on behalf of the signed-in user.
   [View Example](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/ai-fastmcp-js) | [Starter (without Auth0)](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/ai-fastmcp-js-starter)

- **FastMCP + TypeScript (JavaScript):**
   A minimal FastMCP server secured with Auth0 using `@auth0/ai-fastmcp`.
   [View Example](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/fastmcp-mcp-js)

- **FastMCP + Python:**
   A FastMCP server example implementation in Python using the `auth0-api-python` library for Auth0 authentication with Bearer and DPoP token support.
   [View Example](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/fastmcp-mcp-python)

- **FastMCP with Custom Token Exchange (CTE):**
   A FastMCP server demonstrating Auth0 Custom Token Exchange for accessing upstream APIs on behalf of authenticated users.
   [View Example](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/fastmcp-mcp-customtokenexchange-js)

- **FastMCP with Custom Token Exchange (CTE) + Python:**
   A Python implementation of FastMCP server demonstrating Auth0 Custom Token Exchange for accessing upstream APIs on behalf of authenticated users.
   [View Example](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/fastmcp-mcp-customtokenexchange-python)

- **Express + TypeScript (JavaScript):**
   A minimal Express MCP server secured with Auth0 using `@auth0/ai-mcp`.
   [View Example](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/express-mcp-js)

- **Hono + Cloudflare Workers + TypeScript (JavaScript):**
   A Hono server example implementation of an MCP server using Hono framework with Auth0 built for Cloudflare Workers.
   [View Example](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/hono-mcp-js)

- **XMCP + TypeScript (JavaScript):**
   A XMPC server example implementation of an MCP server using XMCP framework with Auth0.
   [View Example](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/xmcp-mcp-js)

- **XMCP with Token Vault + TypeScript (JavaScript):**
   An XMCP server demonstrating Auth0 Token Vault integration for securely accessing third-party APIs (like Google Calendar) on behalf of authenticated users.
   [View Example](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/xmcp-mcp-tokenvault-js)

- **NextJS + TypeScript (JavaScript):**
   A NextJS server example implementation of an MCP server using NextJS framework with Auth0.
   [View Example](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/nextjs-mcp-js)

- **ASP.NET Core MCP Server (C#):**
   An ASP.NET Core server example implementation of an MCP server using the C# SDK for MCP with Auth0.
   [View Example](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/aspnetcore-mcp-server)
