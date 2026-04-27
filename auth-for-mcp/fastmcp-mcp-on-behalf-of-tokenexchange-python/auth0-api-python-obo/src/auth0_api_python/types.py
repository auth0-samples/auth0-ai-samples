"""
Type definitions for auth0-api-python SDK
"""

from collections.abc import Awaitable, Callable
from typing import Optional, TypedDict, Union


class ActClaim(TypedDict, total=False):
    """
    Actor claim carried by access tokens issued through delegation.

    Attributes:
        sub: The current actor for this step of the delegation chain.
        act: The prior actor in the delegation chain, if present.
    """

    sub: str
    act: "ActClaim"


class DomainsResolverContext(TypedDict, total=False):
    """
    Context passed to domains resolver functions.

    Attributes:
        request_url: The URL the API request was made to (optional)
        request_headers: Request headers dict (e.g., Host, X-Forwarded-Host) (optional)
        unverified_iss: The issuer claim from the unverified token
    """
    request_url: Optional[str]
    request_headers: Optional[dict]
    unverified_iss: str


class OnBehalfOfTokenResult(TypedDict, total=False):
    """
    Result returned from an On Behalf Of token exchange.

    Attributes:
        access_token: The access token issued for the downstream API.
        expires_in: Token lifetime in seconds.
        expires_at: Absolute expiration time as a Unix timestamp in seconds, calculated by the SDK from expires_in.
        scope: Granted scopes, if returned by Auth0.
        token_type: Token type, if returned by Auth0.
        issued_token_type: RFC 8693 issued token type, if returned by Auth0.
    """

    access_token: str
    expires_in: int
    expires_at: int
    scope: str
    token_type: str
    issued_token_type: str

DomainsResolver = Callable[
    [DomainsResolverContext], Union[list[str], Awaitable[list[str]]]
]
"""
Type alias for domains resolver function.

A DomainsResolver is a sync or async function that receives a DomainsResolverContext
and returns a list of allowed domain strings.

Args:
    context (DomainsResolverContext): Dictionary containing:
        - 'request_url' (str | None): The URL the API request was made to
        - 'request_headers' (dict | None): Request headers (e.g., Host, X-Forwarded-Host)
        - 'unverified_iss' (str): The issuer claim from the unverified token

Returns:
    list[str]: List of allowed domain strings (e.g., ['tenant.auth0.com'])

Example (sync):
    from auth0_api_python import DomainsResolverContext

    def my_resolver(context: DomainsResolverContext) -> list[str]:
        host = (context.get('request_headers') or {}).get('host')
        if host == 'api.brand.com':
            return ['brand.custom-domain.com']
        return ['tenant.auth0.com']

Example (async):
    async def my_async_resolver(context: DomainsResolverContext) -> list[str]:
        domains = await db.lookup_domains(context['unverified_iss'])
        return domains
"""
