"""Shared test fixtures and helpers for auth0-api-python tests."""

import base64
import urllib.parse
from typing import Optional

import pytest
from pytest_httpx import HTTPXMock

from auth0_api_python import ApiClient, ApiClientOptions
from auth0_api_python.errors import ApiError

# ===== Constants =====

DISCOVERY_URL = "https://auth0.local/.well-known/openid-configuration"
JWKS_URL = "https://auth0.local/.well-known/jwks.json"
TOKEN_ENDPOINT = "https://auth0.local/oauth/token"

# ===== Fixtures =====

@pytest.fixture
def api_client_confidential():
    """Fixture for creating a confidential API client with credentials."""
    return ApiClient(ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret",
    ))


@pytest.fixture
def mock_discovery(httpx_mock: HTTPXMock):
    """Fixture for mocking OIDC discovery endpoint."""
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT},
    )
    return httpx_mock


# ===== Helper Functions =====

def last_form(httpx_mock: HTTPXMock) -> dict[str, list[str]]:
    """Helper to read the last posted form data."""
    req = httpx_mock.get_requests()[-1]
    return urllib.parse.parse_qs(req.content.decode())


def last_auth_header(httpx_mock: HTTPXMock) -> Optional[str]:
    """Get the Authorization header from the last request."""
    return httpx_mock.get_requests()[-1].headers.get("authorization")


def mock_token_response(
    httpx_mock: HTTPXMock,
    token_json: Optional[dict] = None,
    status: int = 200,
    content_type: str = "application/json"
):
    """
    Mock both discovery and token endpoint responses.

    Args:
        httpx_mock: The pytest-httpx mock
        token_json: JSON response body for token endpoint (if status 200)
        status: HTTP status code for token endpoint
        content_type: Content-Type header for token endpoint
    """
    # Guard against misuse: token_json should only be provided for status 200
    if status != 200 and token_json is not None:
        raise AssertionError("token_json is only used when status=200")

    # Mock discovery
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT},
    )

    # Mock token endpoint
    if status == 200 and token_json is not None:
        httpx_mock.add_response(
            method="POST",
            url=TOKEN_ENDPOINT,
            json=token_json,
            status_code=status,
            headers={"Content-Type": content_type},
        )
    else:
        httpx_mock.add_response(
            method="POST",
            url=TOKEN_ENDPOINT,
            status_code=status,
            content="error",
            headers={"Content-Type": content_type},
        )


def token_success(**overrides) -> dict:
    """
    Factory for successful token response.

    Returns a base successful response with optional field overrides.
    """
    base = {
        "access_token": "t",
        "expires_in": 3600,
    }
    base.update(overrides)
    return base


# ===== Assertion Helpers =====

def assert_api_error(
    exc: Exception,
    *,
    code: Optional[str] = None,
    status: Optional[int] = None,
    contains: Optional[str] = None
):
    """
    Assert that an exception is an ApiError with expected properties.

    Args:
        exc: The exception to check
        code: Expected error code
        status: Expected HTTP status code
        contains: String that should appear in error message (case-insensitive)
    """
    assert isinstance(exc, ApiError), f"Expected ApiError, got {type(exc).__name__}"
    if code is not None:
        assert exc.code == code, f"Expected code '{code}', got '{exc.code}'"
    if status is not None:
        assert exc.status_code == status, f"Expected status {status}, got {exc.status_code}"
    if contains is not None:
        assert contains.lower() in str(exc).lower(), f"Expected '{contains}' in error message: {exc}"


def assert_http_basic_auth(httpx_mock: HTTPXMock, username: str, password: str):
    """Assert that HTTP Basic auth header is present and correct."""
    auth_header = last_auth_header(httpx_mock)
    assert auth_header is not None, "Authorization header missing"
    assert auth_header.startswith("Basic "), f"Expected Basic auth, got: {auth_header}"

    # Decode and verify credentials
    encoded = auth_header.split(" ")[1]
    decoded = base64.b64decode(encoded).decode("utf-8")
    expected = f"{username}:{password}"
    assert decoded == expected, f"Expected '{expected}', got '{decoded}'"


def assert_form_post(
    httpx_mock: HTTPXMock,
    *,
    expect_fields: Optional[dict[str, list[str]]] = None,
    forbid_fields: Optional[list[str]] = None,
    expect_basic_auth: Optional[tuple[str, str]] = None,
    expect_url: Optional[str] = None
):
    """
    Assert properties of the last form POST request.

    Args:
        httpx_mock: The pytest-httpx mock
        expect_fields: Dict of field names to expected values
        forbid_fields: List of field names that must NOT be present
        expect_basic_auth: Tuple of (username, password) for Basic auth verification
        expect_url: Expected URL (defaults to TOKEN_ENDPOINT if not specified)
    """
    req = httpx_mock.get_requests()[-1]

    # Verify request method is POST
    assert req.method == "POST", f"Expected POST request, got {req.method}"

    # Verify URL
    expected_url = expect_url or TOKEN_ENDPOINT
    assert str(req.url) == expected_url, f"Expected URL {expected_url}, got {req.url}"

    # Verify Content-Type
    content_type = req.headers.get("content-type", "")
    assert "application/x-www-form-urlencoded" in content_type, \
        f"Expected form-encoded content type, got {content_type}"

    form = last_form(httpx_mock)

    # Check expected fields
    if expect_fields:
        for key, value in expect_fields.items():
            assert key in form, f"Expected field '{key}' not in form: {form.keys()}"
            assert form[key] == value, f"Field '{key}': expected {value}, got {form[key]}"

    # Check forbidden fields
    if forbid_fields:
        for key in forbid_fields:
            assert key not in form, f"Forbidden field '{key}' found in form"

    # Check Basic auth
    if expect_basic_auth:
        assert_http_basic_auth(httpx_mock, expect_basic_auth[0], expect_basic_auth[1])


def assert_no_requests(httpx_mock: HTTPXMock):
    """
    Assert that no HTTP requests were made (useful for validation short-circuit tests).

    Args:
        httpx_mock: The pytest-httpx mock
    """
    requests = httpx_mock.get_requests()
    assert len(requests) == 0, f"Expected no requests, but {len(requests)} were made"
