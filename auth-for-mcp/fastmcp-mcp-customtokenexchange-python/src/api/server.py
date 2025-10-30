"""
Upstream API server that demonstrates a protected resource requiring specific scopes.

This API validates Auth0 JWT tokens and returns authenticated user information.
"""

from __future__ import annotations

import logging

from auth0_api_python import ApiClient, ApiClientOptions
from auth0_api_python.errors import VerifyAccessTokenError
from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from ..config import get_config

config = get_config()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# API client for token verification
api_client = ApiClient(ApiClientOptions(
    domain=config.auth0_domain,
    audience=config.api_auth0_audience
))


class Auth0APIMiddleware(BaseHTTPMiddleware):
    """Middleware that validates Auth0 tokens for the upstream API."""

    def _error_response(self, error: str, description: str, status: int = 401) -> JSONResponse:
        """Build error response with WWW-Authenticate header."""
        return JSONResponse(
            {"error": error, "error_description": description},
            status_code=status,
            headers={"WWW-Authenticate": f'Bearer error="{error}"'} if status == 401 else {}
        )

    async def dispatch(self, request: Request, call_next):
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.lower().startswith("bearer "):
            return self._error_response("invalid_token", "Missing or invalid Authorization header")

        try:
            decoded = await api_client.verify_access_token(
                auth_header[7:].strip(),
                required_claims=["sub"]
            )
            request.state.user = {
                "sub": decoded["sub"],
                "scope": decoded.get("scope", "").split()
            }
            return await call_next(request)
        except VerifyAccessTokenError as e:
            logger.info(f"Token verification failed: {e}")
            return self._error_response("invalid_token", str(e))
        except Exception as e:
            logger.exception("Unexpected error in middleware")
            return self._error_response("server_error", "Internal server error", 500)


def require_scope(scope: str):
    """Decorator requiring a specific scope for endpoint access."""
    def decorator(func):
        async def wrapper(request: Request) -> Response:
            if scope not in request.state.user.get("scope", []):
                return JSONResponse(
                    {"error": "insufficient_scope", "error_description": f"Missing required scope: {scope}"},
                    status_code=403,
                    headers={"WWW-Authenticate": f'Bearer error="insufficient_scope", scope="{scope}"'}
                )
            return await func(request)
        return wrapper
    return decorator


@require_scope("read:private")
async def private_scope_endpoint(request: Request) -> JSONResponse:
    """Protected endpoint requiring 'read:private' scope."""
    user = request.state.user
    return JSONResponse({
        "msg": "Hello from upstream API",
        "sub": user["sub"],
        "scopes": user["scope"]
    })


# Create Starlette app
app = Starlette(
    debug=config.debug,
    routes=[
        Route("/api/private-scope", private_scope_endpoint, methods=["GET"]),
    ],
    middleware=[
        (Auth0APIMiddleware,)
    ]
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8787)
