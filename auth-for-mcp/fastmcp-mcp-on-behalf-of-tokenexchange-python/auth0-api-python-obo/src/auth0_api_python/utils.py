"""
Utility functions for OIDC discovery and JWKS fetching (asynchronously)
using httpx or a custom fetch approach.
"""

import base64
import hashlib
import json
import re
from collections.abc import Mapping
from typing import Any, Callable, Optional, Union

import httpx
from ada_url import URL


def parse_cache_control_max_age(headers: Mapping[str, str]) -> Optional[int]:
    """
    Parse the max-age directive from a Cache-Control HTTP header.

    Args:
        headers: HTTP response headers (dict-like, supports case-insensitive
                 access for httpx Headers objects)

    Returns:
        max-age value in seconds, or None if not present or unparseable
    """
    cache_control = headers.get("cache-control") or headers.get("Cache-Control")
    if not cache_control:
        return None

    for directive in cache_control.split(","):
        directive = directive.strip().lower()
        if directive.startswith("max-age="):
            try:
                value = int(directive[8:].strip())
                return value if value >= 0 else None
            except ValueError:
                return None

    return None


def normalize_domain(domain: str) -> str:
    """
    Normalize a domain string to a standard issuer URL format.

    Args:
        domain: Domain string in any format (e.g., "tenant.auth0.com",
                "https://tenant.auth0.com/", "TENANT.AUTH0.COM")

    Returns:
        Normalized issuer URL (e.g., "https://tenant.auth0.com/")

    """
    if not isinstance(domain, str) or not domain.strip():
        raise ValueError("domain must be a non-empty string")

    domain = domain.strip().lower()

    # Reject http:// explicitly
    if domain.startswith('http://'):
        raise ValueError("invalid domain URL (https required)")

    # Strip https:// prefix
    domain = domain.replace('https://', '')

    # Split host from any path/query/fragment
    host = domain.split('/')[0].split('?')[0].split('#')[0]

    # Reject credentials
    if '@' in host:
        raise ValueError("invalid domain URL (credentials are not allowed)")

    # Check for path segments, query, or fragment
    bare = domain.rstrip('/')
    if bare != host:
        raise ValueError(
            "invalid domain URL (path/query/fragment are not allowed)"
        )

    return f"https://{host}/"


async def fetch_oidc_metadata(
    domain: str,
    custom_fetch: Optional[Callable[..., Any]] = None
) -> tuple[dict[str, Any], Optional[int]]:
    """
    Asynchronously fetch the OIDC config from https://{domain}/.well-known/openid-configuration.

    Returns:
        Tuple of (metadata_dict, max_age_or_none). max_age is parsed from
        the Cache-Control response header if present.
    """
    url = f"https://{domain}/.well-known/openid-configuration"
    if custom_fetch:
        response = await custom_fetch(url)
        if hasattr(response, "json"):
            data = response.json()
            max_age = parse_cache_control_max_age(response.headers) if hasattr(response, "headers") else None
            return data, max_age
        return response, None
    else:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url)
            resp.raise_for_status()
            max_age = parse_cache_control_max_age(resp.headers)
            return resp.json(), max_age


async def fetch_jwks(
    jwks_uri: str,
    custom_fetch: Optional[Callable[..., Any]] = None
) -> tuple[dict[str, Any], Optional[int]]:
    """
    Asynchronously fetch the JSON Web Key Set from jwks_uri.

    Returns:
        Tuple of (jwks_dict, max_age_or_none). max_age is parsed from
        the Cache-Control response header if present.
    """
    if custom_fetch:
        response = await custom_fetch(jwks_uri)
        if hasattr(response, "json"):
            data = response.json()
            max_age = parse_cache_control_max_age(response.headers) if hasattr(response, "headers") else None
            return data, max_age
        return response, None
    else:
        async with httpx.AsyncClient() as client:
            resp = await client.get(jwks_uri)
            resp.raise_for_status()
            max_age = parse_cache_control_max_age(resp.headers)
            return resp.json(), max_age


def _decode_jwt_segment(token: Union[str, bytes], segment_index: int) -> dict:
    """
    Decode a specific segment from a JWT without verifying signature.

    Args:
        token: The JWT token (string or bytes)
        segment_index: 0 for header, 1 for payload

    Returns:
        Decoded segment as dictionary

    Raises:
        ValueError: If token format is invalid
    """
    if isinstance(token, bytes):
        token = token.decode("utf-8")

    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError(f"Invalid token format: expected 3 segments, got {len(parts)}")

    segment_b64 = parts[segment_index]
    segment_b64 = remove_bytes_prefix(segment_b64)
    segment_b64 = fix_base64_padding(segment_b64)

    segment_data = base64.urlsafe_b64decode(segment_b64)
    return json.loads(segment_data)


def get_unverified_header(token: Union[str, bytes]) -> dict:
    """
    Parse the JWT header without verifying signature.

    Args:
        token: The JWT token

    Returns:
        Decoded header as dictionary
    """
    return _decode_jwt_segment(token, 0)


def get_unverified_payload(token: Union[str, bytes]) -> dict:
    """
    Parse the JWT payload without verifying signature.

    Args:
        token: The JWT token

    Returns:
        Decoded payload (claims) as dictionary
    """
    return _decode_jwt_segment(token, 1)



def fix_base64_padding(segment: str) -> str:
    """
    If `segment`'s length is not a multiple of 4, add '=' padding
    so that base64.urlsafe_b64decode won't produce nonsense bytes.
    No extra '=' added if length is already a multiple of 4.
    """
    remainder = len(segment) % 4
    if remainder == 0:
        return segment  # No additional padding needed
    return segment + ("=" * (4 - remainder))

def remove_bytes_prefix(s: str) -> str:
    """If the string looks like b'eyJh...', remove the leading b' and trailing '."""
    if s.startswith("b'"):
        return s[2:]  # cut off the leading b'
    return s

def normalize_url_for_htu(raw_url: str) -> str:
    """
    Normalize URL for DPoP htu comparison .

    Args:
        raw_url: The raw URL string to normalize
    Returns:
        The normalized URL string
    Raises:
        ValueError: If the URL is invalid or cannot be parsed
    """

    try:
        url_obj = URL(raw_url)

        normalized_url = url_obj.origin + url_obj.pathname

        normalized_url = re.sub(
            r'%([0-9a-fA-F]{2})',
            lambda m: f'%{m.group(1).upper()}',
            normalized_url
        )

        return normalized_url
    except Exception as e:
        raise ValueError(f"Invalid URL format: {raw_url}") from e

def sha256_base64url(input_str: Union[str, bytes]) -> str:
    """
    Compute SHA-256 digest of the input string and return a
    Base64URL-encoded string *without* padding.
    """
    if isinstance(input_str, str):
        digest = hashlib.sha256(input_str.encode("utf-8")).digest()
    else:
        digest = hashlib.sha256(input_str).digest()
    b64 = base64.urlsafe_b64encode(digest).decode("utf-8")
    return b64.rstrip("=")

def calculate_jwk_thumbprint(jwk: dict[str, str]) -> str:
    """
    Compute the RFC 7638 JWK thumbprint for a public JWK.

    - For EC keys, includes only: crv, kty, x, y
    - Serializes with no whitespace, keys sorted lexicographically
    - Hashes with SHA-256 and returns base64url-encoded string without padding
    """
    kty = jwk.get("kty")

    if kty == "EC":
        if not all(k in jwk for k in ["crv", "x", "y"]):
            raise ValueError("EC key missing required parameters")
        members = ("crv", "kty", "x", "y")
    else:
        raise ValueError(f"{kty}(Key Type) Parameter missing or unsupported ")

    ordered = {k: jwk[k] for k in members if k in jwk}

    thumbprint_json = json.dumps(ordered, separators=(",", ":"), sort_keys=True)

    digest = hashlib.sha256(thumbprint_json.encode("utf-8")).digest()

    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
