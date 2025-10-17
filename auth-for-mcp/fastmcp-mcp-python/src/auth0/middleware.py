import logging
from collections.abc import Callable
from typing import Any

from auth0_api_python import ApiClient, ApiClientOptions
from auth0_api_python.errors import VerifyAccessTokenError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from .errors import AuthenticationRequired, MalformedAuthorizationRequest

logger = logging.getLogger(__name__)

class Auth0Middleware(BaseHTTPMiddleware):
    """
    Middleware that requires a valid Bearer token in the Authorization header.
    Validates the token using Auth0 SDK Client and stores auth info in request.state.auth.
    """

    def __init__(self, app: ASGIApp, domain: str, audience: str):
        super().__init__(app)
        if not domain or not audience:
            raise RuntimeError("domain and audience must be provided")
        self.client = ApiClient(ApiClientOptions(
            domain=domain,
            audience=audience
        ))

    def _build_auth_data(self, token: dict[str, Any]) -> dict[str, Any]:
        """Extract authentication data from verified token."""
        client_id = token.get('client_id') or token.get('azp')
        if not client_id:
            raise VerifyAccessTokenError("Token missing 'client_id' or 'azp' claim")

        scopes = token.get("scope", "").split() if token.get("scope") else []

        auth_data = {
            "client_id": client_id,
            "scopes": scopes,
        }

        if expires_at := token.get('exp'):
            auth_data["expires_at"] = expires_at

        # Extract extra claims with dict comprehension
        extra_fields = {'sub', 'azp', 'name', 'email', 'client_id'}
        auth_data["extra"] = {
            field: token[field]
            for field in extra_fields
            if field in token
        }

        return auth_data

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Extract Authorization header
        auth_header = request.headers.get("authorization")
        if not auth_header:
            raise MalformedAuthorizationRequest("Missing Authorization header")
        if not auth_header.lower().startswith("bearer "):
            raise MalformedAuthorizationRequest("Invalid Authorization header format")

        # Extract and verify token
        token = auth_header[7:].strip() # Remove "Bearer " prefix
        try:
            decoded_and_verified_token = await self.client.verify_access_token(
                token,
                required_claims=["sub"]
            )

            # Set up authentication context
            request.state.auth = self._build_auth_data(decoded_and_verified_token)

            return await call_next(request)
        except VerifyAccessTokenError:
            logger.info("Token verification failed")
            raise AuthenticationRequired("Invalid token")
        except Exception:
            logger.exception("Unexpected error in middleware")
            raise
