"""
auth0-api-python

A lightweight Python SDK for verifying Auth0-issued access tokens
in server-side APIs, using Authlib for OIDC discovery and JWKS fetching.
"""

from .act import get_current_actor, get_delegation_chain
from .api_client import ApiClient
from .cache import CacheAdapter, InMemoryCache
from .config import ApiClientOptions
from .errors import (
    ApiError,
    ConfigurationError,
    DomainsResolverError,
    GetTokenByExchangeProfileError,
)
from .types import (
    DomainsResolver,
    DomainsResolverContext,
    OnBehalfOfTokenResult,
)

__all__ = [
    "ApiClient",
    "ApiClientOptions",
    "ApiError",
    "CacheAdapter",
    "ConfigurationError",
    "DomainsResolver",
    "DomainsResolverContext",
    "DomainsResolverError",
    "GetTokenByExchangeProfileError",
    "get_current_actor",
    "get_delegation_chain",
    "InMemoryCache",
    "OnBehalfOfTokenResult",
]
