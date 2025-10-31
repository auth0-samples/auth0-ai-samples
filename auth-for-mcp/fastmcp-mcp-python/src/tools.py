import json

from mcp.server.fastmcp import Context

from .auth0 import Auth0Mcp
from .auth0.authz import register_required_scopes, require_scopes


def register_tools(auth0_mcp: Auth0Mcp) -> None:
    """
    Register all tools with the MCP server.
    """
    mcp = auth0_mcp.mcp

    # Tool without required scopes
    @mcp.tool()
    async def get_datetime() -> str:
        """Returns the current UTC date and time"""
        from datetime import datetime, timezone
        utc_datetime = datetime.now(timezone.utc).isoformat()
        return f"Current UTC DateTime: {utc_datetime}"

    # A MCP tool with required scopes
    @mcp.tool(
        name="greet",
        title="Greet Tool",
        description="Greets a user",
        annotations={"readOnlyHint": True}
    )
    @require_scopes(["tool:greet"])
    async def greet(name: str, ctx: Context) -> str:
        name = name.strip() if name else "world"
        auth_info = ctx.request_context.request.state.auth
        user_id = auth_info.get("extra", {}).get("sub")
        return f"Hello, {name}! You are authenticated as {user_id}"

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

    # Register all scopes used by tools for Protected Resource Metadata
    register_required_scopes(auth0_mcp)
