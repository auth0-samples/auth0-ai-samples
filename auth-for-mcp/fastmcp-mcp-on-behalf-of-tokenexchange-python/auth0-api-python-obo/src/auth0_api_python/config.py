"""
Configuration classes and utilities for auth0-api-python.
"""

from typing import TYPE_CHECKING, Callable, Optional, Union

if TYPE_CHECKING:
    from .cache import CacheAdapter


class ApiClientOptions:
    """
    Configuration for the ApiClient.

    Args:
        domain: The Auth0 domain for single-domain mode and client flows,
                e.g., "my-tenant.us.auth0.com". Optional if domains is provided.
        domains: List of allowed domains or a resolver function for multi-domain mode.
                 Can be a static list of domain strings or a callable that returns
                 allowed domains dynamically. Optional if domain is provided.
        audience: The expected 'aud' claim in the token.
        custom_fetch: Optional callable that can replace the default HTTP fetch logic.
        cache_adapter: Custom cache implementation. If not provided, uses default InMemoryCache.
        cache_ttl_seconds: Time-to-live for cache entries in seconds (default: 600 = 10 minutes).
        cache_max_entries: Maximum number of cache entries before LRU eviction (default: 100).
        dpop_enabled: Whether DPoP is enabled (default: True for backward compatibility).
        dpop_required: Whether DPoP is required (default: False, allows both Bearer and DPoP).
        dpop_iat_leeway: Leeway in seconds for DPoP proof iat claim (default: 30).
        dpop_iat_offset: Maximum age in seconds for DPoP proof iat claim (default: 300).
        client_id: Required for get_access_token_for_connection, get_token_by_exchange_profile,
                   and get_token_on_behalf_of.
        client_secret: Required for get_access_token_for_connection, get_token_by_exchange_profile,
                       and get_token_on_behalf_of.
        timeout: HTTP timeout in seconds for token endpoint requests (default: 10.0).
    """
    def __init__(
            self,
            domain: Optional[str] = None,
            audience: str = "",
            domains: Optional[Union[list[str], Callable[[dict], list[str]]]] = None,
            custom_fetch: Optional[Callable[..., object]] = None,
            cache_adapter: Optional["CacheAdapter"] = None,
            cache_ttl_seconds: int = 600,
            cache_max_entries: int = 100,
            dpop_enabled: bool = True,
            dpop_required: bool = False,
            dpop_iat_leeway: int = 30,
            dpop_iat_offset: int = 300,
            client_id: Optional[str] = None,
            client_secret: Optional[str] = None,
            timeout: float = 10.0,
    ):
        self.domain = domain
        self.domains = domains
        self.audience = audience
        self.custom_fetch = custom_fetch
        self.cache_adapter = cache_adapter
        self.cache_ttl_seconds = cache_ttl_seconds
        self.cache_max_entries = cache_max_entries
        self.dpop_enabled = dpop_enabled
        self.dpop_required = dpop_required
        self.dpop_iat_leeway = dpop_iat_leeway
        self.dpop_iat_offset = dpop_iat_offset
        self.client_id = client_id
        self.client_secret = client_secret
        self.timeout = timeout
