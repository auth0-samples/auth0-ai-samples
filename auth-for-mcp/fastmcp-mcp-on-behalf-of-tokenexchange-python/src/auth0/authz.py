from __future__ import annotations

from collections.abc import Iterable
from functools import wraps

from mcp.server.fastmcp import Context

from . import Auth0Mcp
from .errors import AuthenticationRequired, InsufficientScope

# Collect required scopes from all decorated functions
_scopes_required: set[str] = set()

def require_scopes(required_scopes: Iterable[str]):
    """
    Decorator that requires scopes on MCP tools.

    Example:
      @mcp.tool(...)
      @require_scopes(["tool:greet", "tool:whoami"])
      async def my_tool(name: str, ctx: Context) -> str:
        return f"Hello {name}!"
    """
    required_scopes_list = list(required_scopes)

    # Collect scopes when decorator is applied
    _scopes_required.update(required_scopes_list)

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # ctx is passed in either kw or positional
            ctx: Context | None = (kwargs.get("ctx") if isinstance(kwargs.get("ctx"), Context) else None) or next((arg for arg in args if isinstance(arg, Context)), None)
            if ctx is None:
                raise TypeError("ctx: Context is required")

            auth = getattr(ctx.request_context.request.state, "auth", {})
            if not auth:
                raise AuthenticationRequired("Authentication required")

            user_scopes = set(auth.get("scopes", []))
            missing_scopes = [s for s in required_scopes_list if s not in user_scopes]
            if missing_scopes:
                raise InsufficientScope(f"Missing required scopes: {missing_scopes}")

            return await func(*args, **kwargs)
        return wrapper
    return decorator

def register_required_scopes(auth0_mcp: Auth0Mcp) -> None:
    """Register all scopes that were collected from @require_scopes decorators."""
    if _scopes_required:
        auth0_mcp.register_scopes(list(_scopes_required))
        _scopes_required.clear()
