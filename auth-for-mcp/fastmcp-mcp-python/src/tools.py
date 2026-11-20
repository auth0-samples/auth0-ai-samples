import json
from datetime import datetime, timezone

from auth0_ai_mcp import require_caller_principal, with_required_scopes
from mcp.server.mcpserver import MCPServer

TOOL_SCOPES = ["tool:greet", "tool:whoami"]


def register_tools(mcp: MCPServer) -> None:
    """Register all tools with the MCP server."""

    # Tool without required scopes
    @mcp.tool(
        name="get_datetime",
        title="Get DateTime",
        description="Returns the current UTC date and time",
        annotations={"readOnlyHint": True},
    )
    async def get_datetime() -> str:
        return datetime.now(timezone.utc).isoformat()

    # Tool with a required scope. Keep @mcp.tool() above @with_required_scopes
    @mcp.tool(
        name="greet",
        title="Greet Tool",
        description="Greets a user",
        annotations={"readOnlyHint": True},
    )
    @with_required_scopes("tool:greet")
    async def greet(name: str) -> str:
        name = name.strip() if name else "world"
        principal = require_caller_principal()
        return f"Hello, {name}! You are authenticated as {principal.sub}"

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
                "sub": principal.sub,
                "client_id": principal.client_id,
                "scopes": principal.scopes,
            },
            indent=2,
        )
