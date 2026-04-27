"""
Tests for utility functions in auth0_api_python.utils
"""

import asyncio

import pytest

from auth0_api_python.token_utils import generate_token
from auth0_api_python.utils import (
    get_unverified_payload,
    normalize_domain,
    parse_cache_control_max_age,
)

# ===== normalize_domain =====


def test_normalize_domain_bare():
    """Test normalization of bare domain."""
    assert normalize_domain("tenant.auth0.com") == "https://tenant.auth0.com/"


def test_normalize_domain_with_https():
    """Test normalization of domain with https:// prefix."""
    assert normalize_domain("https://tenant.auth0.com") == "https://tenant.auth0.com/"


def test_normalize_domain_with_http():
    """Test that http:// prefix is rejected (https required)."""
    with pytest.raises(ValueError, match="https required"):
        normalize_domain("http://tenant.auth0.com")


def test_normalize_domain_with_trailing_slash():
    """Test normalization of domain with trailing slash."""
    assert normalize_domain("tenant.auth0.com/") == "https://tenant.auth0.com/"


def test_normalize_domain_with_https_and_trailing_slash():
    """Test normalization of fully formatted issuer URL."""
    assert normalize_domain("https://tenant.auth0.com/") == "https://tenant.auth0.com/"


def test_normalize_domain_mixed_case():
    """Test normalization converts to lowercase."""
    assert normalize_domain("TENANT.AUTH0.COM") == "https://tenant.auth0.com/"


def test_normalize_domain_mixed_case_with_protocol():
    """Test normalization with mixed case protocol and domain."""
    assert normalize_domain("HTTPS://Tenant.Auth0.COM") == "https://tenant.auth0.com/"


def test_normalize_domain_with_whitespace():
    """Test normalization strips leading and trailing whitespace."""
    assert normalize_domain("  tenant.auth0.com  ") == "https://tenant.auth0.com/"


def test_normalize_domain_custom_domain():
    """Test normalization with custom domain."""
    assert normalize_domain("auth.example.com") == "https://auth.example.com/"


def test_normalize_domain_multiple_slashes():
    """Test normalization with multiple trailing slashes."""
    assert normalize_domain("tenant.auth0.com///") == "https://tenant.auth0.com/"


def test_normalize_domain_rejects_path():
    """Test that domain with path segments is rejected."""
    with pytest.raises(ValueError, match="path/query/fragment are not allowed"):
        normalize_domain("tenant.auth0.com/some/path")


def test_normalize_domain_rejects_query():
    """Test that domain with query string is rejected."""
    with pytest.raises(ValueError, match="path/query/fragment are not allowed"):
        normalize_domain("tenant.auth0.com?foo=bar")


def test_normalize_domain_rejects_fragment():
    """Test that domain with fragment is rejected."""
    with pytest.raises(ValueError, match="path/query/fragment are not allowed"):
        normalize_domain("tenant.auth0.com#section")


def test_normalize_domain_rejects_credentials():
    """Test that domain with credentials is rejected."""
    with pytest.raises(ValueError, match="credentials are not allowed"):
        normalize_domain("user:pass@tenant.auth0.com")


def test_normalize_domain_rejects_http():
    """Test that http:// scheme is rejected (must use https)."""
    with pytest.raises(ValueError, match="https required"):
        normalize_domain("http://tenant.auth0.com")


def test_normalize_domain_rejects_empty():
    """Test that empty and whitespace-only strings are rejected."""
    with pytest.raises(ValueError, match="non-empty string"):
        normalize_domain("")

    with pytest.raises(ValueError, match="non-empty string"):
        normalize_domain("   ")


# ===== get_unverified_payload =====


def test_get_unverified_payload_valid_token():
    """Test extracting payload from a valid token."""
    token = asyncio.run(generate_token(
        domain="tenant.auth0.com",
        user_id="user123",
        audience="my-api",
        issuer="https://tenant.auth0.com/"
    ))

    payload = get_unverified_payload(token)

    assert payload["iss"] == "https://tenant.auth0.com/"
    assert payload["aud"] == "my-api"
    assert payload["sub"] == "user123"
    assert "exp" in payload
    assert "iat" in payload


def test_get_unverified_payload_invalid_token():
    """Test that malformed token raises ValueError."""
    invalid_token = "not.a.valid.jwt.token"

    with pytest.raises(ValueError, match="Invalid token format"):
        get_unverified_payload(invalid_token)


# ===== parse_cache_control_max_age =====


@pytest.mark.parametrize("headers,expected", [
    ({"cache-control": "max-age=300"}, 300),
    ({"cache-control": "public, max-age=600, must-revalidate"}, 600),
    ({}, None),
])
def test_parse_cache_control_max_age(headers, expected):
    """Test parsing max-age from Cache-Control headers."""
    assert parse_cache_control_max_age(headers) == expected
