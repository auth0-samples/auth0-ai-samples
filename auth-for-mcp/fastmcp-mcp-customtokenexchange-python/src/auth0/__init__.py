"""
Auth0 integration for MCP server with Custom Token Exchange support.

This module provides Auth0 authentication and authorization for MCP servers,
including token verification, middleware, scoped tool decorators, and custom token exchange.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from mcp.server.auth.routes import create_protected_resource_routes
from mcp.server.fastmcp import FastMCP
from starlette.middleware import Middleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route, Router

from .errors import AuthenticationRequired, InsufficientScope, MalformedAuthorizationRequest
from .middleware import Auth0Middleware

logger = logging.getLogger(__name__)


class Auth0Mcp:
    """
    Auth0 integration for FastMCP servers with Custom Token Exchange support.

    Provides authentication middleware, authorization decorators,
    OAuth2 Protected Resource metadata endpoints, and custom token exchange for MCP servers.

    Args:
        name: Human-readable name for the MCP server
        audience: Auth0 API identifier (OAuth2 audience claim)
        domain: Auth0 tenant domain (e.g., 'tenant.us.auth0.com')
        client_id: Auth0 client ID for CTE (optional)
        client_secret: Auth0 client secret for CTE (optional)
        mcp_server_url: Base URL of the MCP server (optional)

    Raises:
        RuntimeError: If audience or domain are not provided
    """
    def __init__(
        self,
        name: str,
        audience: str,
        domain: str,
        client_id: str | None = None,
        client_secret: str | None = None,
        mcp_server_url: str | None = None
    ):
        self.name = name
        self.audience = audience
        self.domain = domain
        self.client_id = client_id
        self.client_secret = client_secret
        self.mcp_server_url = mcp_server_url
        if not self.audience or not self.domain:
            raise RuntimeError("audience and domain must be provided")
        self.mcp = FastMCP(
            name=self.name,
            stateless_http=True,
        )
        self._scopes_supported = {
            "openid",
            "profile",
            "email"
        }

    def auth_metadata_router(self) -> Router:
        """
        Returns a router that serves the OAuth Protected Resource Metadata
        at the standard endpoint: /.well-known/oauth-protected-resource
        """
        routes: list[Route] = create_protected_resource_routes(
            resource_url=self.audience,
            authorization_servers=[f"https://{self.domain}"],
            scopes_supported=list(self._scopes_supported),
            resource_name=self.name,
        )

        return Router(routes=routes)

    def auth_middleware(self) -> list[Middleware]:
        return [Middleware(
            Auth0Middleware,
            domain=self.domain,
            audience=self.audience,
            client_id=self.client_id,
            client_secret=self.client_secret
        )]

    def register_scopes(self, scopes: list[str]) -> None:
        """
        Register scopes that tools require.

        Args:
            scopes: List of scopes to register (e.g., ["tool:greet", "tool:whoami"])
        """
        if scopes:
            self._scopes_supported.update(scopes)

    def exception_handlers(self) -> dict[int | type[Exception], Callable[[Request, Exception], Response]]:
        return {
            AuthenticationRequired: self._auth_error_handler,
            InsufficientScope: self._auth_error_handler,
            MalformedAuthorizationRequest: self._auth_error_handler,
            # Generic fallback for any other exceptions
            Exception: self._generic_exception_handler,
        }

    def _auth_error_handler(self, request: Request, exc: Exception) -> JSONResponse:
        """
        Handle auth errors: malformed authorization requests, missing auth, invalid tokens, and insufficient scopes.
        """
        # Include resource metadata parameter for 401 responses per RFC 9728 Section 5.1
        include_resource_metadata = exc.status_code == 401

        return JSONResponse(
            {
                "error": exc.error_code,
                "error_description": exc.description
            },
            status_code=exc.status_code,
            headers={"WWW-Authenticate": self._build_www_authenticate_header(exc.error_code, exc.description, include_resource_metadata)},
        )

    def _generic_exception_handler(self, request: Request, exc: Exception) -> JSONResponse:
        """
        Fallback handler for all other exceptions.
        """
        logger.error(f"Unexpected error in: {exc}", exc_info=exc)

        # Return standard HTTP 500 error
        return JSONResponse(
            {
                "error": "internal_server_error",
                "error_description": "An unexpected error occurred"
            },
            status_code=500,
        )

    def _build_www_authenticate_header(self, error_code: str, description: str, include_resource_metadata: bool = False) -> str:
        """
        Build WWW-Authenticate header according to RFC 9728 Section 5.1.
        """
        www_auth_params = [f'error="{error_code}"', f'error_description="{description}"']
        if include_resource_metadata and self.mcp_server_url:
            metadata_url = self.mcp_server_url.rstrip("/") + "/.well-known/oauth-protected-resource"
            www_auth_params.append(f'resource_metadata="{metadata_url}"')

        return f"Bearer {', '.join(www_auth_params)}"
