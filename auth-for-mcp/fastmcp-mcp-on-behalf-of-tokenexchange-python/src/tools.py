import json
import logging
from datetime import datetime, timezone

import httpx
from auth0_ai_mcp import (
    require_caller_mcp_client,
    require_caller_principal,
    with_required_scopes,
)
from mcp.server.mcpserver import MCPServer

from .config import get_config

logger = logging.getLogger(__name__)

TOOL_SCOPES = ["tool:greet", "tool:whoami"]


def register_tools(mcp: MCPServer) -> None:
    """
    Register all tools with the MCP server.
    """
    config = get_config()

    # A MCP tool with required scopes
    @mcp.tool(
        name="whoami",
        title="Who Am I Tool",
        description="Returns information about the authenticated user",
        annotations={"readOnlyHint": True},
    )
    @with_required_scopes("tool:whoami")
    async def whoami() -> str:
        principal = require_caller_principal()
        return json.dumps(
            {
                "user": {"sub": principal.sub, "client_id": principal.client_id},
                "scopes": principal.scopes,
            },
            indent=2,
        )

    # A MCP tool with On-Behalf-Of Token Exchange
    @mcp.tool(
        name="greet",
        title="Greet User with On-Behalf-Of Token Exchange",
        description="Greet a user with personalized authentication information retrieved from an upstream API using On-Behalf-Of Token Exchange.",
        annotations={"readOnlyHint": True},
    )
    @with_required_scopes("tool:greet")
    async def greet(name: str) -> str:
        user_name = name.strip() if name else "there"
        user_id = require_caller_principal().sub

        logger.info(f"Greet tool invoked for user: {user_id}")

        # Exchange the caller's token for one that the upstream API accepts
        exchanged = await require_caller_mcp_client().get_token_on_behalf_of(
            audience=config.api_auth0_audience,
            scope=config.mcp_auth0_exchange_scope or None,
        )

        access_token = exchanged["access_token"]
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{config.api_base_url}/api/private-scope",
                headers={"authorization": f"Bearer {access_token}"},
            )
            upstream_result = response.json()
            logger.info(f"Upstream API response: {upstream_result}")

        return f"""Hello, {user_name} ({user_id})!
Upstream API Response: {json.dumps(upstream_result, indent=2)}"""

    # A MCP Tool without required scopes
    @mcp.tool(
        name="get_datetime",
        title="Get DateTime",
        description="Returns the current UTC date and time",
        annotations={"readOnlyHint": True},
    )
    async def get_datetime() -> str:
        """Returns the current UTC date and time"""
        return datetime.now(timezone.utc).isoformat()
