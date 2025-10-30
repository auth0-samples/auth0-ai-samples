import json
import logging

import httpx
from mcp.server.fastmcp import Context

from .auth0 import Auth0Mcp
from .auth0.authz import register_required_scopes, require_scopes
from .config import get_config

logger = logging.getLogger(__name__)


def register_tools(auth0_mcp: Auth0Mcp) -> None:
    """
    Register all tools with the MCP server.
    """
    mcp = auth0_mcp.mcp
    config = get_config()

    async def exchange_custom_token(api_client, subject_token: str) -> dict:
        """Exchange subject token for access token via Custom Token Exchange."""
        result = await api_client.get_token_by_exchange_profile(
            subject_token=subject_token,
            subject_token_type=config.mcp_auth0_subject_token_type,
            audience=config.api_auth0_audience,
            scope=config.mcp_auth0_exchange_scope or None
        )
        return {"token": result["access_token"], "scopes": result.get("scope", "")}

    # A MCP tool with required scopes
    @mcp.tool(
        name="whoami",
        title="Who Am I Tool",
        description="Returns information about the authenticated user",
        annotations={"readOnlyHint": True}
    )
    @require_scopes(["tool:whoami"])
    async def whoami(ctx: Context) -> str:
        auth_info = ctx.request_context.request.state.auth

        response_data = {
            "user": auth_info.get("extra", {}),
            "scopes": auth_info.get("scopes", []),
        }
        return json.dumps(response_data, indent=2)

    # A MCP tool with Custom Token Exchange
    @mcp.tool(
        name="greet",
        title="Greet User with Custom Token Exchange",
        description="Greet a user with personalized authentication information retrieved from an upstream API using Custom Token Exchange.",
        annotations={"readOnlyHint": True}
    )
    @require_scopes(["tool:greet"])
    async def greet(name: str, ctx: Context) -> str:
        user_name = name.strip() if name else "there"
        auth_info = ctx.request_context.request.state.auth
        user_id = auth_info.get("extra", {}).get("sub")

        logger.info(f"Greet tool invoked for user: {user_id}")

        # Exchange token and call upstream API
        exchange_result = await exchange_custom_token(
            ctx.request_context.request.state.api_client,
            auth_info["token"]
        )

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{config.api_base_url}/api/private-scope",
                headers={"authorization": f"Bearer {exchange_result['token']}"}
            )
            upstream_result = response.json()
            logger.info(f"Upstream API response: {upstream_result}")

        return f"""Hello, {user_name} ({user_id})!
Upstream API Response: {json.dumps(upstream_result, indent=2)}"""

    # Register all scopes used by tools for Protected Resource Metadata
    register_required_scopes(auth0_mcp)
