from __future__ import annotations

import logging

from auth0_ai_mcp import create_mcp_client
from auth0_ai_mcp.middleware import Auth0AsgiMiddleware
from mcp.server.mcpserver import MCPServer
from starlette.middleware.cors import CORSMiddleware

from .config import get_config
from .tools import TOOL_SCOPES, register_tools

config = get_config()

logging.basicConfig(level=logging.INFO)

# The client id and secret let the server exchange the caller's token for a downstream API token
mcp_client = create_mcp_client(
    domain=config.auth0_domain,
    audience=config.auth0_audience,
    client_id=config.mcp_auth0_client_id,
    client_secret=config.mcp_auth0_client_secret,
)

mcp = MCPServer("Example MCP Server with On-Behalf-Of Token Exchange")
register_tools(mcp)

# The metadata and bearer token checks come from the middleware, so no other auth code is needed
auth_app = Auth0AsgiMiddleware(
    mcp.streamable_http_app(streamable_http_path="/"),
    mcp_client=mcp_client,
    scopes_supported=TOOL_SCOPES,
)

# CORS exposes Mcp-Session-Id for browser clients and sits outside auth so 401s carry CORS headers
app = CORSMiddleware(
    auth_app,
    allow_origins=config.cors_origins,
    allow_methods=["GET", "POST", "DELETE"],
    expose_headers=["Mcp-Session-Id"],
)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, port=config.port)
