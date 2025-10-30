from __future__ import annotations

import contextlib
import logging
from collections.abc import AsyncIterator

from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.routing import Mount

from .auth0 import Auth0Mcp
from .config import get_config
from .tools import register_tools

config = get_config()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

auth0_mcp = Auth0Mcp(
    name="Example FastMCP Server with Custom Token Exchange",
    audience=config.auth0_audience,
    domain=config.auth0_domain,
    client_id=config.mcp_auth0_client_id,
    client_secret=config.mcp_auth0_client_secret,
    mcp_server_url=config.mcp_server_url
)
register_tools(auth0_mcp)

@contextlib.asynccontextmanager
async def lifespan(app: Starlette) -> AsyncIterator[None]:
    async with contextlib.AsyncExitStack() as stack:
        await stack.enter_async_context(auth0_mcp.mcp.session_manager.run())
        yield

starlette_app = Starlette(
    debug=config.debug,
    routes=[
        # Add discovery metadata route
        *auth0_mcp.auth_metadata_router().routes,

        # Main MCP app route with authentication middleware
        Mount(
            "/",
            app=auth0_mcp.mcp.streamable_http_app(),
            middleware=auth0_mcp.auth_middleware()
        ),
    ],
    lifespan=lifespan,
    exception_handlers=auth0_mcp.exception_handlers(),
)

# Wrap ASGI application with CORS middleware to expose Mcp-Session-Id header
# for browser-based clients (ensures 500 errors get proper CORS headers)

app = CORSMiddleware(
    starlette_app,
    allow_origins=config.cors_origins,
    allow_methods=["GET", "POST", "DELETE"], # MCP streamable HTTP methods
    expose_headers=["Mcp-Session-Id"],
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, port=config.port)
