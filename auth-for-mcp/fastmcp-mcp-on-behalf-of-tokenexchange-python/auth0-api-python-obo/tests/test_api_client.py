import base64
import json
import time

import httpx
import pytest

# Import shared helpers and constants from conftest
from conftest import (
    DISCOVERY_URL,
    JWKS_URL,
    TOKEN_ENDPOINT,
    assert_api_error,
    assert_form_post,
    assert_no_requests,
    last_form,
    token_success,
)
from freezegun import freeze_time
from pytest_httpx import HTTPXMock

from auth0_api_python import get_current_actor, get_delegation_chain
from auth0_api_python.api_client import MAX_ARRAY_VALUES_PER_KEY, ApiClient
from auth0_api_python.config import ApiClientOptions
from auth0_api_python.errors import (
    ApiError,
    ConfigurationError,
    DomainsResolverError,
    GetAccessTokenForConnectionError,
    GetTokenByExchangeProfileError,
    InvalidAuthSchemeError,
    InvalidDpopProofError,
    MissingAuthorizationError,
    MissingRequiredArgumentError,
    VerifyAccessTokenError,
)
from auth0_api_python.token_utils import (
    PRIVATE_EC_JWK,
    PRIVATE_JWK,
    generate_dpop_proof,
    generate_token,
    generate_token_with_cnf,
    sha256_base64url,
)

# Create public RSA JWK by selecting only public key components
PUBLIC_RSA_JWK = {k: PRIVATE_JWK[k] for k in ["kty", "n", "e", "alg", "use", "kid"] if k in PRIVATE_JWK}


# ===== Tests =====

@pytest.mark.asyncio
async def test_init_missing_args():
    """
    Test that providing no audience or domain raises an error.
    """


    # Empty domain now raises ConfigurationError (not MissingRequiredArgumentError)
    with pytest.raises(ConfigurationError):
        _ = ApiClient(ApiClientOptions(domain="", audience="some_audience"))

    # Empty audience still raises MissingRequiredArgumentError
    with pytest.raises(MissingRequiredArgumentError):
        _ = ApiClient(ApiClientOptions(domain="example.us.auth0.com", audience=""))


@pytest.mark.asyncio
async def test_verify_access_token_successfully(httpx_mock: HTTPXMock):
    """
    Test that a valid RS256 token with correct issuer, audience, iat, and exp
    is verified successfully by ApiClient.
    """
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "issuer": "https://auth0.local/",
            "jwks_uri": JWKS_URL
        }
    )
    httpx_mock.add_response(
        method="GET",
        url=JWKS_URL,
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    access_token = await generate_token(
        domain="auth0.local",
        user_id="user_123",
        audience="my-audience",    # sets 'aud'
        issuer=None,               # uses default "https://auth0.local/"
        iat=True,
        exp=True
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    # 5) Verify the token
    claims = await api_client.verify_access_token(access_token=access_token)
    assert claims["sub"] == "user_123"


@pytest.mark.asyncio
async def test_verify_access_token_preserves_act_claim(httpx_mock: HTTPXMock):
    """
    Test that verified access token claims expose the act claim for OBO delegation.
    """
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "issuer": "https://auth0.local/",
            "jwks_uri": JWKS_URL
        }
    )
    httpx_mock.add_response(
        method="GET",
        url=JWKS_URL,
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    access_token = await generate_token(
        domain="auth0.local",
        user_id="user_123",
        audience="my-audience",
        issuer=None,
        iat=True,
        exp=True,
        claims={
            "act": {
                "sub": "mcp_server_client_id",
                "act": {
                    "sub": "spa_client_id",
                },
            },
        },
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    claims = await api_client.verify_access_token(access_token=access_token)

    assert claims["sub"] == "user_123"
    assert claims["act"]["sub"] == "mcp_server_client_id"
    assert get_current_actor(claims) == "mcp_server_client_id"
    assert get_delegation_chain(claims) == [
        "mcp_server_client_id",
        "spa_client_id",
    ]

@pytest.mark.asyncio
async def test_verify_access_token_fail_no_iss():
    """
    Test that a token missing 'iss' claim fails verification during pre-validation.
    No HTTP mocks needed since pre-validation rejects before network calls.
    """
    access_token = await generate_token(
        domain="auth0.local",
        user_id="user_123",
        audience="my-audience",
        issuer=False,  # skip 'iss'
        iat=True,
        exp=True
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_access_token(access_token=access_token)

    assert "missing 'iss' claim" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_access_token_fail_invalid_iss(httpx_mock: HTTPXMock):
    """
    Test that a token with an invalid issuer fails verification.
    In single-domain mode, discovery is fetched from configured domain.
    First issuer validation fails before JWKS fetch.
    """
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "issuer": "https://auth0.local/",
            "jwks_uri": JWKS_URL
        }
    )

    access_token = await generate_token(
        domain="auth0.local",
        user_id="user_123",
        audience="my-audience",
        issuer="https://invalid-issuer.local",  # mismatch
        iat=True,
        exp=True
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_access_token(access_token=access_token)

    # Should fail at first issuer validation
    assert "does not match" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_access_token_fail_no_aud(httpx_mock: HTTPXMock):
    """
    Test that a token missing 'aud' claim fails verification.
    """
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "issuer": "https://auth0.local/",
            "jwks_uri": JWKS_URL
        }
    )

    httpx_mock.add_response(
        method="GET",
        url=JWKS_URL,
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    access_token = await generate_token(
        domain="auth0.local",
        user_id="user_123",
        audience=None,  # no 'aud' claim
        issuer=None,
        iat=True,
        exp=True
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_access_token(access_token=access_token)

    assert "aud" in str(err.value).lower() or "audience" in str(err.value).lower()


@pytest.mark.asyncio
async def test_verify_access_token_fail_invalid_aud(httpx_mock: HTTPXMock):
    """
    Test that a token with an invalid audience fails verification.
    """

    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "issuer": "https://auth0.local/",
            "jwks_uri": JWKS_URL
        }
    )
    httpx_mock.add_response(
        method="GET",
        url=JWKS_URL,
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )


    access_token = await generate_token(
        domain="auth0.local",
        user_id="user_123",
        audience="wrong-aud",  # mismatch from the config
        issuer=None,
        iat=True,
        exp=True
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_access_token(access_token=access_token)


    error_str = str(err.value).lower()
    assert "audience mismatch" in error_str or "invalid aud" in error_str


@pytest.mark.asyncio
async def test_verify_access_token_fail_no_iat(httpx_mock: HTTPXMock):
    """
    Test that a token missing 'iat' claim fails verification.
    """
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "issuer": "https://auth0.local/",
            "jwks_uri": JWKS_URL
        }
    )
    httpx_mock.add_response(
        method="GET",
        url=JWKS_URL,
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    access_token = await generate_token(
        domain="auth0.local",
        user_id="user_123",
        audience="my-audience",
        issuer=None,
        iat=False,  # skip iat
        exp=True
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_access_token(access_token=access_token)

    assert "iat" in str(err.value).lower() or "missing" in str(err.value).lower()


@pytest.mark.asyncio
async def test_verify_access_token_fail_no_exp(httpx_mock: HTTPXMock):
    """
    Test that a token missing 'exp' claim fails verification.
    """
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "issuer": "https://auth0.local/",
            "jwks_uri": JWKS_URL
        }
    )
    httpx_mock.add_response(
        method="GET",
        url=JWKS_URL,
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )


    access_token = await generate_token(
        domain="auth0.local",
        user_id="user_123",
        audience="my-audience",
        issuer=None,
        iat=True,
        exp=False  # skip exp
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_access_token(access_token=access_token)


    error_str = str(err.value).lower()
    assert "exp" in error_str or "missing" in error_str


@pytest.mark.asyncio
async def test_verify_access_token_fail_no_audience_config():
    """
    Test that if the ApiClient doesn't get an audience in ApiClientOptions,
    it raises a MissingRequiredArgumentError or similar.
    """

    with pytest.raises(MissingRequiredArgumentError) as err:

        _ = ApiClient(

            ApiClientOptions(domain="auth0.local", audience="")
        )

    error_str = str(err.value).lower()
    assert "audience" in error_str and ("required" in error_str or "not provided" in error_str)

@pytest.mark.asyncio
async def test_verify_access_token_fail_malformed_token():
    """Test that a malformed token fails verification."""

    api_client = ApiClient(ApiClientOptions(domain="auth0.local", audience="my-audience"))

    with pytest.raises(VerifyAccessTokenError)   as e:
        await api_client.verify_access_token("header.payload")
    assert "failed to parse token" in str(e.value).lower()

    with pytest.raises(VerifyAccessTokenError) as e:
        await api_client.verify_access_token("header.pay!load.signature")
    assert "failed to parse token" in str(e.value).lower()



# DPOP PROOF VERIFICATION TESTS

# --- Core Success Tests ---

@pytest.mark.asyncio
async def test_verify_dpop_proof_successfully():
    """
    Test that a valid DPoP proof is verified successfully by ApiClient.
    """
    access_token = "test_token"
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    # Verify the DPoP proof
    claims = await api_client.verify_dpop_proof(
        access_token=access_token,
        proof=dpop_proof,
        http_method="GET",
        http_url="https://api.example.com/resource"
    )
    assert claims["jti"] # Verify it has the required jti claim
    assert claims["htm"] == "GET"
    assert claims["htu"] == "https://api.example.com/resource"
    assert isinstance(claims["iat"], int)
    expected_ath = sha256_base64url(access_token)
    assert claims["ath"] == expected_ath


# --- Header Validation Tests ---

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_no_access_token():
    """
    Test that verify_dpop_proof fails when access_token is missing.
    """
    dpop_proof = await generate_dpop_proof(
        access_token="test_token",
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(MissingRequiredArgumentError) as err:
        await api_client.verify_dpop_proof(
            access_token="",  # Empty access token
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "access_token" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_no_dpop_proof():
    """
    Test that verify_dpop_proof fails when dpop_proof is missing.
    """
    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(MissingRequiredArgumentError) as err:
        await api_client.verify_dpop_proof(
            access_token="test_token",
            proof="",  # Empty proof
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "dpop_proof" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_no_http_method_url():
    """
    Test that verify_dpop_proof fails when http_method or http_url is missing.
    """
    access_token = "test_token"
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(MissingRequiredArgumentError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="",  # Empty method
            http_url="https://api.example.com/resource"
        )

    assert "http_method" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_no_http_url():
    """
    Test that verify_dpop_proof fails when http_url is missing.
    """
    access_token = "test_token"
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(MissingRequiredArgumentError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",
            http_url="" # Empty url
        )

    assert "http_url" in str(err.value).lower()


# --- Claim Validation Tests ---

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_no_typ():
    """
    Test that a DPoP proof missing 'typ' header fails verification.
    """
    access_token = "test_token"
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource",
        header_overrides={"typ": None}  # Remove typ header
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "unexpected jwt 'typ'" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_invalid_typ():
    """
    Test that a DPoP proof with invalid 'typ' header fails verification.
    """
    access_token = "test_token"
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource",
        header_overrides={"typ": "jwt"}  # Wrong typ value
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "unexpected jwt 'typ'" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_invalid_alg():
    """
    Test that a DPoP proof with unsupported algorithm fails verification.
    """
    access_token = "test_token"

    valid_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    parts = valid_proof.split('.')
    header = json.loads(base64.urlsafe_b64decode(parts[0] + '==').decode('utf-8'))
    header['alg'] = 'RS256'  # Invalid algorithm for DPoP (should be ES256)

    modified_header = base64.urlsafe_b64encode(
        json.dumps(header, separators=(',', ':')).encode('utf-8')
    ).decode('utf-8').rstrip('=')

    invalid_proof = f"{modified_header}.{parts[1]}.{parts[2]}"

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=invalid_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "unsupported alg" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_no_jwk():
    """
    Test that a DPoP proof missing 'jwk' header fails verification.
    """
    access_token = "test_token"
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource",
        header_overrides={"jwk": None}  # Remove jwk header
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "missing or invalid jwk" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_invalid_jwk_format():
    """
    Test that a DPoP proof with invalid 'jwk' format fails verification.
    """
    access_token = "test_token"
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource",
        header_overrides={"jwk": "invalid_jwk"}  # Invalid jwk format
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "missing or invalid jwk" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_private_key_in_jwk():
    """
    Test that a DPoP proof with private key material in jwk fails verification.
    """

    access_token = "test_token"
    # Include private key material (the 'd' parameter)
    invalid_jwk = dict(PRIVATE_EC_JWK)  # This includes the 'd' parameter

    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource",
        header_overrides={"jwk": invalid_jwk}  # JWK with private key material
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "private key" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_with_missing_jwk_parameters():
    """Test verify_dpop_proof with missing JWK parameters."""
    access_token = "test_token"

    incomplete_jwk = {"kty": "RSA"}

    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource",
        header_overrides={"jwk": incomplete_jwk}
    )

    api_client = ApiClient(ApiClientOptions(domain="auth0.local", audience="my-audience"))
    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )
    assert "only ec keys are supported" in str(err.value).lower()

# --- IAT (Issued At Time) Validation Tests ---

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_no_iat():
    """
    Test that a DPoP proof missing 'iat' claim fails verification.
    """
    access_token = "test_token"
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource",
        iat=False  # Skip iat claim
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "missing required claim" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_invalid_iat_in_future():
    """
     Test IAT validation with a timestamp in the future.
    """
    access_token = "test_token"
    # Use a future timestamp (more than leeway allows)
    future_time = int(time.time()) + 3600  # 1 hour in the future
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource",
        iat_time=future_time  # Invalid future timestamp
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "iat is from the future" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_iat_exact_boundary_conditions():
    """
    Test IAT timing validation at exact boundary conditions.
    """
    access_token = "test_token"

    # Test with timestamp exactly at the leeway boundary (should pass)
    current_time = int(time.time())
    boundary_time = current_time + 30  # Exactly at default leeway limit

    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource",
        iat_time=boundary_time
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    # Should succeed as it's within leeway
    result = await api_client.verify_dpop_proof(
        access_token=access_token,
        proof=dpop_proof,
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    assert result is not None

@pytest.mark.asyncio
async def test_verify_dpop_proof_iat_in_past():
    """
    Test IAT validation with timestamp in the past.
    """
    access_token = "test_token"
    # Use a timestamp too far in the past
    past_time = int(time.time()) - 3600  # 1 hour ago
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource",
        iat_time=past_time
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "iat is too old" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_iat_within_leeway():
    """
    Test that IAT timestamps within acceptable leeway pass validation.
    """
    access_token = "test_token"
    current_time = int(time.time())

    # Test within acceptable skew (should pass)
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource",
        iat_time=current_time - 30  # 30 seconds ago, should be acceptable
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    # This should succeed due to clock skew tolerance
    result = await api_client.verify_dpop_proof(
        access_token=access_token,
        proof=dpop_proof,
        http_method="GET",
        http_url="https://api.example.com/resource"
    )
    assert result is not None

# --- JTI (JWT ID) Validation Tests ---

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_empty_jti():
    """
    Test that a DPoP proof with empty 'jti' claim fails verification.
    """
    access_token = "test_token"
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource",
        jti=""  # Empty jti claim
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "jti claim must not be empty" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_custom_jti_value():
    """
    Test for a custom JTI value.
    """
    access_token = "test_token"

    custom_jti = "unique-jti-12345"
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource",
        jti=custom_jti  # Use jti parameter instead of claims
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    # First verification should succeed
    result = await api_client.verify_dpop_proof(
        access_token=access_token,
        proof=dpop_proof,
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    assert result is not None
    assert result["jti"] == custom_jti

@pytest.mark.asyncio
async def test_verify_dpop_proof_with_missing_jti():
    """Test verify_dpop_proof with missing jti claim."""
    access_token = "test_token"

    # Generate DPoP proof WITHOUT jti claim from the start
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource",
        include_jti=False  # Completely omit jti claim
    )

    api_client = ApiClient(ApiClientOptions(domain="auth0.local", audience="my-audience"))
    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )
    assert "missing required claim: jti" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_htm_mismatch():
    """
    Test that a DPoP proof with mismatched 'htm' claim fails verification.
    """
    access_token = "test_token"
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="POST",  # Generate proof for POST
        http_url="https://api.example.com/resource",
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",  # But verify with GET
            http_url="https://api.example.com/resource"
        )

    assert "htm mismatch" in str(err.value).lower()

# --- HTU (HTTP URI) Validation Tests ---

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_htu_mismatch():
    """
    Test that a DPoP proof with mismatched 'htu' claim fails verification.
    """
    access_token = "test_token"
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/wrong-resource",  # Generate proof for wrong URL
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"  # But verify with correct URL
        )

    assert "htu mismatch" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_htu_url_normalization_case_sensitivity():
    """
    Test HTU URL normalization handles case sensitivity correctly.
    """
    access_token = "test_token"

    # Test with different case in domain (should be normalized and pass)
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://API.EXAMPLE.COM/resource"  # Uppercase domain
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    # This should succeed due to URL normalization
    result = await api_client.verify_dpop_proof(
        access_token=access_token,
        proof=dpop_proof,
        http_method="GET",
        http_url="https://api.example.com/resource"  # Lowercase domain
    )
    assert result is not None


@pytest.mark.asyncio
async def test_verify_dpop_proof_htu_trailing_slash_mismatch():
    """
    Test that HTU URLs with trailing slash differences cause verification failure.
    """
    access_token = "test_token"
    # Generate proof with trailing slash
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource/"
    )
    api_client = ApiClient(ApiClientOptions(domain="auth0.local", audience="my-audience"))
    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )
    assert "htu mismatch" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_htu_query_parameters():
    """
    Test HTU URL validation with query parameters - normalized behavior.
    Query parameters are stripped during normalization, so different params should succeed.
    """
    access_token = "test_token"

    # Test with query parameters (should be normalized)
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource?param1=value1"  # With query params
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    # This should succeed due to URL normalization
    result = await api_client.verify_dpop_proof(
        access_token=access_token,
        proof=dpop_proof,
        http_method="GET",
        http_url="https://api.example.com/resource?param2=value2"  # Different query params
    )
    assert result is not None


@pytest.mark.asyncio
async def test_verify_dpop_proof_htu_port_numbers():
    """
    Test HTU URL validation with explicit port numbers - normalized behavior.
    Default ports (443 for HTTPS, 80 for HTTP) are stripped during normalization.
    """
    access_token = "test_token"

    # Test with explicit default port (should be normalized)
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com:443/resource"  # Explicit HTTPS port
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    # This should succeed due to URL normalization
    result = await api_client.verify_dpop_proof(
        access_token=access_token,
        proof=dpop_proof,
        http_method="GET",
        http_url="https://api.example.com/resource"  # Implicit HTTPS port
    )
    assert result is not None

@pytest.mark.asyncio
async def test_verify_dpop_proof_htu_fragment_handling():
    """
    Test HTU URL validation ignores fragments.
    """
    access_token = "test_token"

    # Test with fragment (should be ignored)
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource#fragment1"  # With fragment
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    # This should succeed as fragments are ignored
    result = await api_client.verify_dpop_proof(
        access_token=access_token,
        proof=dpop_proof,
        http_method="GET",
        http_url="https://api.example.com/resource#fragment2"  # Different fragment
    )
    assert result is not None


@pytest.mark.asyncio
async def test_verify_dpop_proof_htu_trailing_slash_preserved():
    """
    Test that trailing slashes are preserved when query params and fragments are removed.
    """
    access_token = "test_token"

    # Generate proof with trailing slash and query parameters
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource/?abc=def"
    )

    api_client = ApiClient(ApiClientOptions(domain="auth0.local", audience="my-audience"))

    # This should succeed because normalization preserves
    result = await api_client.verify_dpop_proof(
        access_token=access_token,
        proof=dpop_proof,
        http_method="GET",
        http_url="https://api.example.com/resource/"  # With trailing slash, no query params
    )

    assert result["htu"] == "https://api.example.com/resource/"

    # Additional test with a different combination
    dpop_proof2 = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource/?abc=def#fragment"
    )

    result2 = await api_client.verify_dpop_proof(
        access_token=access_token,
        proof=dpop_proof2,
        http_method="GET",
        http_url="https://api.example.com/resource/"
    )

    assert result2["htu"] == "https://api.example.com/resource/"

@pytest.mark.asyncio
async def test_verify_dpop_proof_fail_ath_mismatch():
    """
    Test that a DPoP proof with mismatched 'ath' claim fails verification.
    """
    access_token = "test_token"
    wrong_token = "wrong_token"

    dpop_proof = await generate_dpop_proof(
        access_token=wrong_token,  # Generate proof for wrong token
        http_method="GET",
        http_url="https://api.example.com/resource",
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_dpop_proof(
            access_token=access_token,  # But verify with correct token
            proof=dpop_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "ath" in str(err.value).lower() or "hash" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_dpop_proof_with_invalid_signature():
    """Test verify_dpop_proof with invalid signature."""
    access_token = "test_token"

    valid_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    parts = valid_proof.split('.')
    if len(parts) == 3:
        header, payload, signature = parts
        tampered_proof = f"{header}.{payload}.{signature[:-5]}12345"
    else:
        tampered_proof = valid_proof

    api_client = ApiClient(ApiClientOptions(domain="auth0.local", audience="my-audience"))
    with pytest.raises(InvalidDpopProofError) as e:
        await api_client.verify_dpop_proof(
            access_token=access_token,
            proof=tampered_proof,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )
    assert "signature verification failed" in str(e.value).lower()

# VERIFY_REQUEST TESTS

# --- Success Tests ---

@pytest.mark.asyncio
async def test_verify_request_bearer_scheme_success(httpx_mock: HTTPXMock):
    """
    Test successful Bearer token verification through verify_request.
    """
    # Mock OIDC discovery
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "jwks_uri": JWKS_URL,
            "issuer": "https://auth0.local/",
        },
    )

    # Mock JWKS endpoint
    httpx_mock.add_response(
        method="GET",
        url=JWKS_URL,
        json={"keys": [PUBLIC_RSA_JWK]},
    )

    # Generate a valid Bearer token
    token = await generate_token(
        domain="auth0.local",
        user_id="test_user",
        audience="my-audience",
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    # Test Bearer scheme
    result = await api_client.verify_request(
        headers={"authorization": f"Bearer {token}"},
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    assert "sub" in result
    assert result["aud"] == "my-audience"
    assert result["iss"] == "https://auth0.local/"

@pytest.mark.asyncio
async def test_verify_request_dpop_scheme_success(httpx_mock: HTTPXMock):
    """
    Test successful DPoP token verification through verify_request.
    """
    # Mock OIDC discovery
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "jwks_uri": JWKS_URL,
            "issuer": "https://auth0.local/",
        },
    )

    # Mock JWKS endpoint
    httpx_mock.add_response(
        method="GET",
        url=JWKS_URL,
        json={"keys": [PUBLIC_RSA_JWK]},
    )

    # Generate DPoP bound token and proof
    access_token = await generate_token_with_cnf(
        domain="auth0.local",
        user_id="test_user",
        audience="my-audience",
    )
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    # Test DPoP scheme
    result = await api_client.verify_request(
        headers={"authorization": f"DPoP {access_token}", "dpop": dpop_proof},
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    assert "sub" in result
    assert result["aud"] == "my-audience"
    assert result["iss"] == "https://auth0.local/"

@pytest.mark.asyncio
async def test_verify_request_header_normalization(httpx_mock: HTTPXMock):
    """
    Test that header key normalization works (uppercase Authorization header).
    """
    # Mock OIDC discovery
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "jwks_uri": JWKS_URL,
            "issuer": "https://auth0.local/",
        },
    )

    # Mock JWKS endpoint
    httpx_mock.add_response(
        method="GET",
        url=JWKS_URL,
        json={"keys": [PUBLIC_RSA_JWK]},
    )

    # Generate a valid Bearer token
    token = await generate_token(
        domain="auth0.local",
        user_id="test_user",
        audience="my-audience",
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    # Test with uppercase header key
    result = await api_client.verify_request(
        headers={"Authorization": f"Bearer {token}"},  # Uppercase
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    assert "sub" in result
    assert result["aud"] == "my-audience"


@pytest.mark.asyncio
async def test_verify_request_dpop_header_case_insensitive(httpx_mock: HTTPXMock):
    """Test that DPoP header is case-insensitive."""
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "jwks_uri": JWKS_URL,
            "issuer": "https://auth0.local/"
        }
    )
    httpx_mock.add_response(
        method="GET",
        url=JWKS_URL,
        json={"keys": [PUBLIC_RSA_JWK]}
    )

    access_token = await generate_token_with_cnf(
        domain="auth0.local",
        user_id="user_123",
        audience="my-audience"
    )
    proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    # Test with uppercase "DPoP" header key
    result = await api_client.verify_request(
        headers={
            "authorization": f"DPoP {access_token}",
            "DPoP": proof  # Uppercase
        },
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    assert result["aud"] == "my-audience"
    assert result["sub"] == "user_123"


# --- Configuration & Error Handling Tests ---

@pytest.mark.asyncio
async def test_verify_request_fail_dpop_required_mode():
    """
    Test that Bearer tokens are rejected when DPoP is required.
    """
    # Generate a valid Bearer token
    token = await generate_token(
        domain="auth0.local",
        user_id="test_user",
        audience="my-audience",
    )

    api_client = ApiClient(
        ApiClientOptions(
            domain="auth0.local",
            audience="my-audience",
            dpop_required=True  # Require DPoP
        )
    )

    with pytest.raises(InvalidAuthSchemeError) as err:
        await api_client.verify_request(
            headers={"authorization": f"Bearer {token}"},
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert err.value.get_status_code() == 400
    assert "invalid_request" in str(err.value.get_error_code()).lower()

@pytest.mark.asyncio
async def test_verify_request_fail_dpop_enabled_bearer_with_cnf_conflict(httpx_mock: HTTPXMock):
    """
    Test that Bearer tokens with cnf claim are rejected when DPoP is enabled.
    """
    # Mock OIDC discovery
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "jwks_uri": JWKS_URL,
            "issuer": "https://auth0.local/",
        },
    )

    # Mock JWKS endpoint
    httpx_mock.add_response(
        method="GET",
        url=JWKS_URL,
        json={"keys": [PUBLIC_RSA_JWK]},
    )

    # Generate a token with cnf claim (DPoP-bound token)
    token = await generate_token_with_cnf(
        domain="auth0.local",
        user_id="test_user",
        audience="my-audience",
    )

    api_client = ApiClient(
        ApiClientOptions(
            domain="auth0.local",
            audience="my-audience",
            dpop_enabled=True  # DPoP enabled
        )
    )

    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_request(
            headers={"authorization": f"Bearer {token}"},
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "dpop-bound token requires the dpop authentication scheme, not bearer" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_request_fail_dpop_disabled():
    """
    Test that DPoP tokens are rejected when DPoP is disabled.
    """
    access_token = "test_token"
    dpop_proof = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    api_client = ApiClient(
        ApiClientOptions(
            domain="auth0.local",
            audience="my-audience",
            dpop_enabled=False  # DPoP disabled
        )
    )

    with pytest.raises(MissingAuthorizationError) as err:
        await api_client.verify_request(
            headers={"authorization": f"DPoP {access_token}", "dpop": dpop_proof},
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert err.value.get_status_code() == 400
    assert "invalid_request" in str(err.value.get_error_code()).lower()

@pytest.mark.asyncio
async def test_verify_request_fail_missing_authorization_header():
    """
    Test that requests without Authorization header are rejected.
    """
    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(MissingAuthorizationError) as err:
        await api_client.verify_request(
            headers={},
            http_method="GET",
            http_url="https://api.example.com/resource"
        )
    assert err.value.get_status_code() == 400
    assert "invalid_request" in str(err.value.get_error_code()).lower()

@pytest.mark.asyncio
async def test_verify_request_fail_unsupported_scheme():
    """
    Test that unsupported authentication schemes are rejected.
    """
    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(MissingAuthorizationError) as err:
        await api_client.verify_request(
            headers={"authorization": "Basic dXNlcjpwYXNz"},
            http_method="GET",
            http_url="https://api.example.com/resource"
        )
    assert err.value.get_status_code() == 400
    assert "invalid_request" in str(err.value.get_error_code()).lower()

@pytest.mark.asyncio
async def test_verify_request_fail_empty_bearer_token():
    """Test verify_request with empty token value."""
    api_client = ApiClient(ApiClientOptions(domain="auth0.local", audience="my-audience"))
    with pytest.raises(MissingAuthorizationError) as err:
        await api_client.verify_request({"Authorization": "Bearer "})
    assert err.value.get_status_code() == 400
    assert "invalid_request" in str(err.value.get_error_code()).lower()

@pytest.mark.asyncio
async def test_verify_request_with_multiple_spaces_in_authorization():
    """Test verify_request with authorization header containing multiple spaces."""
    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )
    # split(None, 1) handles extra spaces between scheme and token gracefully,
    # but malformed tokens with spaces inside fail during JWT parsing
    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_request({"authorization": "Bearer  token  with  extra  spaces"})
    assert "failed to parse token" in str(err.value).lower()

@pytest.mark.asyncio
async def test_verify_request_fail_missing_dpop_header():
    """
    Test that DPoP scheme requests without DPoP header are rejected.
    """
    access_token = "test_token"

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidAuthSchemeError) as err:
        await api_client.verify_request(
            headers={"authorization": f"DPoP {access_token}"},  # Missing DPoP header
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert err.value.get_status_code() == 400
    assert "invalid_request" in str(err.value.get_error_code()).lower()

@pytest.mark.asyncio
async def test_verify_request_fail_multiple_dpop_proofs():
    """
    Test that requests with multiple DPoP proofs are rejected.
    """
    access_token = "test_token"
    dpop_proof1 = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource"
    )
    dpop_proof2 = await generate_dpop_proof(
        access_token=access_token,
        http_method="GET",
        http_url="https://api.example.com/resource"
    )

    api_client = ApiClient(
        ApiClientOptions(domain="auth0.local", audience="my-audience")
    )

    with pytest.raises(InvalidDpopProofError) as err:
        await api_client.verify_request(
            headers={"authorization": f"DPoP {access_token}", "dpop": f"{dpop_proof1}, {dpop_proof2}"},  # Multiple proofs
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert "multiple" in str(err.value).lower()

@pytest.mark.parametrize(
    "dpop_required,auth_header,dpop_header,expected_error",
    [
        (True, "Bearer token", None, InvalidAuthSchemeError),  # DPoP required but Bearer provided
        (True, "DPoP token", None, InvalidAuthSchemeError),  # DPoP required but no DPoP header
    ],
    ids=["dpop-required-bearer-rejected", "dpop-required-missing-dpop-header"]
)
@pytest.mark.asyncio
async def test_verify_request_dpop_required_mismatch(dpop_required, auth_header, dpop_header, expected_error):
    """
    Parametric test for DPoP required mode mismatches.
    """
    api_client = ApiClient(
        ApiClientOptions(
            domain="auth0.local",
            audience="my-audience",
            dpop_required=dpop_required
        )
    )

    headers = {"authorization": auth_header}
    if dpop_header:
        headers["dpop"] = dpop_header

    with pytest.raises(expected_error) as err:
        await api_client.verify_request(
            headers=headers,
            http_method="GET",
            http_url="https://api.example.com/resource"
        )

    assert err.value.get_status_code() == 400
    assert "invalid_request" in str(err.value.get_error_code()).lower()

@pytest.mark.asyncio
async def test_get_access_token_for_connection_success(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "token_endpoint": TOKEN_ENDPOINT
        }
    )
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json={"access_token": "abc123", "expires_in": 3600, "scope": "openid"}
    )
    options = ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret",
    )
    api_client = ApiClient(options)
    result = await api_client.get_access_token_for_connection({
        "connection": "test-conn",
        "access_token": "user-token"
    })
    assert result["access_token"] == "abc123"
    assert result["scope"] == "openid"
    assert isinstance(result["expires_at"], int)

@pytest.mark.asyncio
async def test_get_access_token_for_connection_with_login_hint(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "token_endpoint": TOKEN_ENDPOINT
        }
    )
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json={"access_token": "abc123", "expires_in": 3600, "scope": "openid"}
    )
    options = ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret",
    )
    api_client = ApiClient(options)
    result = await api_client.get_access_token_for_connection({
        "connection": "test-conn",
        "access_token": "user-token",
        "login_hint": "user@example.com"
    })
    assert result["access_token"] == "abc123"
    form_data = last_form(httpx_mock)
    assert form_data["login_hint"] == ["user@example.com"]

@pytest.mark.asyncio
async def test_get_access_token_for_connection_missing_connection():
    options = ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret",
    )
    api_client = ApiClient(options)
    with pytest.raises(MissingRequiredArgumentError):
        await api_client.get_access_token_for_connection({
            "access_token": "user-token"
        })

@pytest.mark.asyncio
async def test_get_access_token_for_connection_missing_access_token():
    options = ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret",
    )
    api_client = ApiClient(options)
    with pytest.raises(MissingRequiredArgumentError):
        await api_client.get_access_token_for_connection({
            "connection": "test-conn"
        })

@pytest.mark.asyncio
async def test_get_access_token_for_connection_no_client_id():
    options = ApiClientOptions(
        domain="auth0.local",
        audience="my-audience"
        # client_id missing
    )
    api_client = ApiClient(options)
    with pytest.raises(GetAccessTokenForConnectionError) as err:
        await api_client.get_access_token_for_connection({
            "connection": "test-conn",
            "access_token": "user-token"
        })

    assert "client_id and client_secret" in str(err.value).lower()

@pytest.mark.asyncio
async def test_get_access_token_for_connection_token_endpoint_error(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={
            "token_endpoint": TOKEN_ENDPOINT
        }
    )
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        status_code=400,
        json={"error": "invalid_request", "error_description": "Bad request"}
    )
    options = ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret",
    )
    api_client = ApiClient(options)
    with pytest.raises(ApiError) as err:
        await api_client.get_access_token_for_connection({
            "connection": "test-conn",
            "access_token": "user-token"
        })
    assert err.value.code == "invalid_request"
    assert err.value.status_code == 400

@pytest.mark.asyncio
async def test_get_access_token_for_connection_timeout_error(httpx_mock: HTTPXMock):
    # Mock OIDC discovery
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT}
    )
    # Simulate timeout on POST
    httpx_mock.add_exception(
        method="POST",
        url=TOKEN_ENDPOINT,
        exception=httpx.TimeoutException("Request timed out")
    )
    options = ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret",
    )
    api_client = ApiClient(options)
    with pytest.raises(ApiError) as err:
        await api_client.get_access_token_for_connection({
            "connection": "test-conn",
            "access_token": "user-token"
        })
    assert err.value.code == "timeout_error"
    assert "timed out" in str(err.value)

@pytest.mark.asyncio
async def test_get_access_token_for_connection_network_error(httpx_mock: HTTPXMock):
    # Mock OIDC discovery
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT}
    )
    # Simulate HTTPError on POST
    httpx_mock.add_exception(
        method="POST",
        url=TOKEN_ENDPOINT,
        exception=httpx.RequestError("Network unreachable", request=httpx.Request("POST", TOKEN_ENDPOINT))
    )
    options = ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret",
    )
    api_client = ApiClient(options)
    with pytest.raises(ApiError) as err:
        await api_client.get_access_token_for_connection({
            "connection": "test-conn",
            "access_token": "user-token"
        })
    assert err.value.code == "network_error"
    assert "network error" in str(err.value).lower()

@pytest.mark.asyncio
async def test_get_access_token_for_connection_error_text_json_content_type(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT}
    )
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        status_code=400,
        content=json.dumps({"error": "invalid_request", "error_description": "Bad request"}),
        headers={"Content-Type": "text/json"}
    )
    options = ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret",
    )
    api_client = ApiClient(options)
    with pytest.raises(ApiError) as err:
        await api_client.get_access_token_for_connection({
            "connection": "test-conn",
            "access_token": "user-token"
        })
    assert err.value.code == "invalid_request"
    assert err.value.status_code == 400
    assert "bad request" in str(err.value).lower()


@pytest.mark.asyncio
async def test_get_access_token_for_connection_invalid_json(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT}
    )
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        status_code=200,
        content="not a json",  # Invalid JSON
        headers={"Content-Type": "application/json"}
    )
    options = ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret",
    )
    api_client = ApiClient(options)
    with pytest.raises(ApiError) as err:
        await api_client.get_access_token_for_connection({
            "connection": "test-conn",
            "access_token": "user-token"
        })
    assert err.value.code == "invalid_json"
    assert "invalid json" in str(err.value).lower()


@pytest.mark.asyncio
async def test_get_access_token_for_connection_invalid_access_token_type(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT}
    )
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        status_code=200,
        json={"access_token": 12345, "expires_in": 3600}  # access_token not a string
    )
    options = ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret",
    )
    api_client = ApiClient(options)
    with pytest.raises(ApiError) as err:
        await api_client.get_access_token_for_connection({
            "connection": "test-conn",
            "access_token": "user-token"
        })
    assert err.value.code == "invalid_response"
    assert "access_token" in str(err.value).lower()
    assert err.value.status_code == 502


@pytest.mark.asyncio
async def test_get_access_token_for_connection_expires_in_not_integer(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT}
    )
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        status_code=200,
        json={"access_token": "abc123", "expires_in": "not-an-int"}
    )
    options = ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret",
    )
    api_client = ApiClient(options)
    with pytest.raises(ApiError) as err:
        await api_client.get_access_token_for_connection({
            "connection": "test-conn",
            "access_token": "user-token"
        })
    assert err.value.code == "invalid_response"
    assert "expires_in" in str(err.value).lower()
    assert err.value.status_code == 502


# ===== Custom Token Exchange Tests =====


@pytest.mark.asyncio
async def test_get_token_by_exchange_profile_success(httpx_mock: HTTPXMock):
    """Test successful token exchange via profile."""
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT}
    )
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json={
            "access_token": "exchanged_token",
            "expires_in": 3600,
            "scope": "openid profile",
            "id_token": "id_token_value",
            "refresh_token": "refresh_token_value",
            "token_type": "Bearer",
            "issued_token_type": "urn:ietf:params:oauth:token-type:access_token"
        }
    )

    api_client = ApiClient(ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret"
    ))

    result = await api_client.get_token_by_exchange_profile(
        subject_token="custom-token-123",
        subject_token_type="urn:example:custom-token",
        audience="https://api.example.com",
        scope="openid profile"
    )

    assert result["access_token"] == "exchanged_token"
    assert result["expires_in"] == 3600
    assert result["scope"] == "openid profile"
    assert result["id_token"] == "id_token_value"
    assert result["refresh_token"] == "refresh_token_value"
    assert result["token_type"] == "Bearer"
    assert result["issued_token_type"] == "urn:ietf:params:oauth:token-type:access_token"
    assert isinstance(result["expires_at"], int)

    # Verify request parameters
    form_data = last_form(httpx_mock)
    assert form_data["grant_type"] == ["urn:ietf:params:oauth:grant-type:token-exchange"]
    assert form_data["subject_token"] == ["custom-token-123"]
    assert form_data["subject_token_type"] == ["urn:example:custom-token"]
    assert form_data["audience"] == ["https://api.example.com"]


@freeze_time("2025-01-01T00:00:00Z")
@pytest.mark.asyncio
async def test_sets_expires_at(mock_discovery, api_client_confidential, httpx_mock):
    """Test that expires_at is set deterministically."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json={"access_token": "t", "expires_in": 3600}
    )
    result = await api_client_confidential.get_token_by_exchange_profile(
        subject_token="t",
        subject_token_type="urn:x"
    )
    assert result["expires_at"] == 1735693200


@pytest.mark.parametrize(
    "kwargs,exc,msg",
    [
        ({"subject_token": "", "subject_token_type": "urn:x"}, MissingRequiredArgumentError, "subject_token"),
        ({"subject_token": "t", "subject_token_type": ""}, MissingRequiredArgumentError, "subject_token_type"),
        ({"subject_token": "   ", "subject_token_type": "urn:x"}, GetTokenByExchangeProfileError, "whitespace"),
        ({"subject_token": " token ", "subject_token_type": "urn:x"}, GetTokenByExchangeProfileError, "leading or trailing whitespace"),
        ({"subject_token": "Bearer abc", "subject_token_type": "urn:x"}, GetTokenByExchangeProfileError, "Bearer"),
        ({"subject_token": "bearer abc", "subject_token_type": "urn:x"}, GetTokenByExchangeProfileError, "Bearer"),
    ],
    ids=["missing-token", "missing-type", "blank", "surrounding-whitespace", "bearer-prefix", "bearer-prefix-lowercase"],
)
@pytest.mark.asyncio
async def test_exchange_profile_input_validation(api_client_confidential, kwargs, exc, msg):
    """Test input validation for get_token_by_exchange_profile."""
    with pytest.raises(exc) as err:
        await api_client_confidential.get_token_by_exchange_profile(**kwargs)
    assert msg.lower() in str(err.value).lower()


@pytest.mark.asyncio
async def test_validation_short_circuits(api_client_confidential, httpx_mock):
    """Test that validation errors prevent network requests."""
    with pytest.raises(GetTokenByExchangeProfileError):
        await api_client_confidential.get_token_by_exchange_profile(subject_token=" ", subject_token_type="urn:x")
    # Verify no network requests were made (validation failed before discovery)
    assert_no_requests(httpx_mock)


@pytest.mark.parametrize(
    "opts, description",
    [
        (ApiClientOptions(domain="auth0.local", audience="my-audience", client_secret="csecret"), "missing client_id"),
        (ApiClientOptions(domain="auth0.local", audience="my-audience", client_id="cid"), "missing client_secret"),
        (ApiClientOptions(domain="auth0.local", audience="my-audience"), "missing both"),
    ],
    ids=["missing-client_id", "missing-client_secret", "missing-both"]
)
@pytest.mark.asyncio
async def test_get_token_by_exchange_profile_missing_credentials(opts, description):
    """Test that missing client credentials raise error."""
    api_client = ApiClient(opts)

    with pytest.raises(GetTokenByExchangeProfileError) as err:
        await api_client.get_token_by_exchange_profile(
            subject_token="token",
            subject_token_type="urn:example:type"
        )
    assert "client credentials" in str(err.value).lower()


@pytest.mark.asyncio
async def test_get_token_by_exchange_profile_uses_http_basic_auth(httpx_mock: HTTPXMock):
    """Test that client credentials are sent via HTTP Basic auth, not form body."""
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT}
    )
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json={"access_token": "token", "expires_in": 3600}
    )

    api_client = ApiClient(ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="test_client",
        client_secret="test_secret"
    ))

    await api_client.get_token_by_exchange_profile(
        subject_token="token",
        subject_token_type="urn:example:type"
    )

    # Verify HTTP Basic auth is used and credentials are NOT in form body
    assert_form_post(
        httpx_mock,
        forbid_fields=["client_id", "client_secret"],
        expect_basic_auth=("test_client", "test_secret")
    )


@pytest.mark.parametrize(
    "denied_param",
    [
        "grant_type", "client_id", "client_secret", "subject_token",
        "subject_token_type", "audience", "scope", "connection"
    ],
    ids=["grant_type", "client_id", "client_secret", "subject_token",
         "subject_token_type", "audience", "scope", "connection"]
)
@pytest.mark.asyncio
async def test_get_token_by_exchange_profile_extra_params_denylist(httpx_mock: HTTPXMock, denied_param):
    """Test that reserved extra parameters fail fast."""
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT}
    )

    api_client = ApiClient(ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret"
    ))

    with pytest.raises(GetTokenByExchangeProfileError) as err:
        await api_client.get_token_by_exchange_profile(
            subject_token="token",
            subject_token_type="urn:example:type",
            extra={denied_param: "should_fail"}
        )

    assert "reserved" in str(err.value).lower()
    assert denied_param in str(err.value)


@pytest.mark.asyncio
async def test_extra_array_exact_limit_passes(mock_discovery, api_client_confidential, httpx_mock):
    """Test that array with exactly MAX_ARRAY_VALUES_PER_KEY passes."""


    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json={"access_token": "t", "expires_in": 3600}
    )

    exact_size = list(map(str, range(MAX_ARRAY_VALUES_PER_KEY)))
    result = await api_client_confidential.get_token_by_exchange_profile(
        subject_token="t",
        subject_token_type="urn:x",
        extra={"roles": exact_size}
    )

    # Verify it passes
    assert result["access_token"] == "t"
    form_data = last_form(httpx_mock)
    assert len(form_data["roles"]) == MAX_ARRAY_VALUES_PER_KEY


@pytest.mark.asyncio
async def test_extra_array_limit(mock_discovery, api_client_confidential):
    """Test that array size limit is enforced (DoS protection)."""


    # Create array exceeding limit
    big = list(map(str, range(MAX_ARRAY_VALUES_PER_KEY + 1)))

    with pytest.raises(GetTokenByExchangeProfileError) as err:
        await api_client_confidential.get_token_by_exchange_profile(
            subject_token="t",
            subject_token_type="urn:x",
            extra={"roles": big}
        )
    assert "maximum array size" in str(err.value).lower()


@pytest.mark.parametrize(
    "param_name",
    ["Scope", "RESOURCE", "Audience", "GRANT_TYPE", "Subject_Token"],
    ids=["Scope", "RESOURCE", "Audience", "GRANT_TYPE", "Subject_Token"]
)
@pytest.mark.asyncio
async def test_extra_reserved_case_insensitive_parametric(mock_discovery, api_client_confidential, param_name):
    """Test that reserved parameter check is case-insensitive for multiple params."""
    with pytest.raises(GetTokenByExchangeProfileError) as err:
        await api_client_confidential.get_token_by_exchange_profile(
            subject_token="t",
            subject_token_type="urn:x",
            extra={param_name: "value"}
        )
    assert "reserved" in str(err.value).lower()
    assert param_name in str(err.value)


@pytest.mark.asyncio
async def test_extra_reserved_case_insensitive(mock_discovery, api_client_confidential):
    """Test that reserved parameter check is case-insensitive."""
    with pytest.raises(GetTokenByExchangeProfileError) as err:
        await api_client_confidential.get_token_by_exchange_profile(
            subject_token="t",
            subject_token_type="urn:x",
            extra={"Client_ID": "x"}
        )
    assert "reserved" in str(err.value).lower()


@pytest.mark.asyncio
async def test_extra_mixed_type_array(mock_discovery, api_client_confidential, httpx_mock):
    """Test that mixed type arrays are coerced to strings."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json={"access_token": "t", "expires_in": 3600}
    )

    await api_client_confidential.get_token_by_exchange_profile(
        subject_token="t",
        subject_token_type="urn:x",
        extra={"values": [1, "2", 3.5]}
    )

    # Verify mixed types are all stringified
    form_data = last_form(httpx_mock)
    assert form_data["values"] == ["1", "2", "3.5"]


@pytest.mark.asyncio
async def test_extra_numeric_string_array(mock_discovery, api_client_confidential, httpx_mock):
    """Test that numeric strings in arrays are preserved."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json={"access_token": "t", "expires_in": 3600}
    )

    await api_client_confidential.get_token_by_exchange_profile(
        subject_token="t",
        subject_token_type="urn:x",
        extra={"ids": ["1", "2", "3"]}
    )

    # Verify string arrays are preserved
    form_data = last_form(httpx_mock)
    assert form_data["ids"] == ["1", "2", "3"]


@pytest.mark.asyncio
async def test_extra_tuple_support(mock_discovery, api_client_confidential, httpx_mock):
    """Test that tuple values are accepted and converted to strings."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json=token_success()
    )

    await api_client_confidential.get_token_by_exchange_profile(
        subject_token="t",
        subject_token_type="urn:x",
        extra={"roles": ("admin", "user", "viewer")}
    )

    # Verify tuple was converted to list of strings
    form_data = last_form(httpx_mock)
    assert form_data["roles"] == ["admin", "user", "viewer"]


@pytest.mark.parametrize(
    "invalid_extra, expected_type_name",
    [
        ({"metadata": {"key": "value"}}, "dict"),
        ({"tags": {"admin", "user"}}, "set"),
        ({"data": b"binary"}, "bytes"),
    ],
    ids=["dict", "set", "bytes"]
)
@pytest.mark.asyncio
async def test_extra_invalid_types_rejected(mock_discovery, api_client_confidential, invalid_extra, expected_type_name):
    """Test that unsupported types in 'extra' params are rejected."""
    with pytest.raises(GetTokenByExchangeProfileError) as err:
        await api_client_confidential.get_token_by_exchange_profile(
            subject_token="t",
            subject_token_type="urn:x",
            extra=invalid_extra
        )
    assert "unsupported type" in str(err.value).lower()
    assert expected_type_name in str(err.value).lower()


@pytest.mark.parametrize(
    "value,expected",
    [
        ("string", "string"),
        (42, "42"),
        (3.14, "3.14"),
        (True, "True"),
        (False, "False"),
        (None, "None"),
    ],
    ids=["str", "int", "float", "bool-true", "bool-false", "none"]
)
@pytest.mark.asyncio
async def test_extra_value_types_stringification(mock_discovery, api_client_confidential, httpx_mock, value, expected):
    """Test that various extra param value types are stringified."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json=token_success()
    )

    await api_client_confidential.get_token_by_exchange_profile(
        subject_token="t",
        subject_token_type="urn:x",
        extra={"param": value}
    )

    form_data = last_form(httpx_mock)
    assert form_data["param"] == [expected]


@pytest.mark.asyncio
async def test_optional_fields_preserve_falsy_values(mock_discovery, api_client_confidential, httpx_mock):
    """Test that optional fields preserve legitimate falsy values like empty scope."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json={
            "access_token": "t",
            "expires_in": 3600,
            "scope": "",  # Empty scope should be preserved
            "token_type": "Bearer"
        }
    )

    result = await api_client_confidential.get_token_by_exchange_profile(
        subject_token="t",
        subject_token_type="urn:x"
    )

    # Verify empty scope is preserved (not dropped)
    assert result["scope"] == ""
    assert result["token_type"] == "Bearer"
    assert "id_token" not in result  # Not present, shouldn't be in result
    assert "refresh_token" not in result


@pytest.mark.parametrize(
    "discovery_status, discovery_json, token_exception, expected_exc, contains",
    [
        (200, {"issuer": "https://auth0.local/"}, None, GetTokenByExchangeProfileError, "token endpoint"),  # Missing endpoint
        (200, {"token_endpoint": TOKEN_ENDPOINT}, httpx.TimeoutException("timeout"), ApiError, "timeout"),  # Token timeout
        (200, {"token_endpoint": TOKEN_ENDPOINT}, httpx.RequestError("unreachable", request=httpx.Request("POST", TOKEN_ENDPOINT)), ApiError, "network"),  # Token network
        (500, None, None, (ApiError, httpx.HTTPStatusError), None),  # Discovery 500
    ],
    ids=["missing-endpoint", "token-timeout", "token-network", "discovery-500"]
)
@pytest.mark.asyncio
async def test_exchange_failure_matrix(httpx_mock, discovery_status, discovery_json, token_exception, expected_exc, contains):
    """Test comprehensive failure scenarios for discovery and token endpoints."""
    # Setup discovery response
    if discovery_json:
        httpx_mock.add_response(
            method="GET",
            url=DISCOVERY_URL,
            status_code=discovery_status,
            json=discovery_json
        )
    else:
        httpx_mock.add_response(
            method="GET",
            url=DISCOVERY_URL,
            status_code=discovery_status
        )

    # Setup token exception if provided
    if token_exception:
        httpx_mock.add_exception(
            method="POST",
            url=TOKEN_ENDPOINT,
            exception=token_exception
        )

    api_client = ApiClient(ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret"
    ))

    with pytest.raises(expected_exc) as err:
        await api_client.get_token_by_exchange_profile(
            subject_token="t",
            subject_token_type="urn:x"
        )

    if contains:
        assert contains in str(err.value).lower()


@pytest.mark.asyncio
async def test_get_token_by_exchange_profile_api_error(httpx_mock: HTTPXMock):
    """Test handling of API errors from token endpoint."""
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT}
    )
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        status_code=400,
        json={"error": "invalid_grant", "error_description": "Invalid subject token"}
    )

    api_client = ApiClient(ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret"
    ))

    with pytest.raises(ApiError) as err:
        await api_client.get_token_by_exchange_profile(
            subject_token="token",
            subject_token_type="urn:example:type"
        )
    assert err.value.code == "invalid_grant"
    assert err.value.status_code == 400


@pytest.mark.asyncio
async def test_token_endpoint_non_200_non_json(mock_discovery, api_client_confidential, httpx_mock):
    """Test that non-200 with non-JSON body defaults to generic error code."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        status_code=400,
        content="Bad Request",
        headers={"Content-Type": "text/plain"}
    )

    with pytest.raises(ApiError) as err:
        await api_client_confidential.get_token_by_exchange_profile(
            subject_token="t",
            subject_token_type="urn:x"
        )
    assert_api_error(err.value, code="token_exchange_error", status=400)


@pytest.mark.asyncio
async def test_token_endpoint_200_non_json(mock_discovery, api_client_confidential, httpx_mock):
    """Test that 200 with non-JSON body raises invalid_json error."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        status_code=200,
        content="not json",
        headers={"Content-Type": "text/plain"}
    )

    with pytest.raises(ApiError) as err:
        await api_client_confidential.get_token_by_exchange_profile(
            subject_token="t",
            subject_token_type="urn:x"
        )
    assert_api_error(err.value, code="invalid_json", status=502)


@pytest.mark.asyncio
async def test_response_empty_id_token_preserved(mock_discovery, api_client_confidential, httpx_mock):
    """Test that empty but present id_token is preserved."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json={
            "access_token": "t",
            "expires_in": 3600,
            "id_token": "",  # Empty but present
            "refresh_token": ""  # Empty but present
        }
    )

    result = await api_client_confidential.get_token_by_exchange_profile(
        subject_token="t",
        subject_token_type="urn:x"
    )

    # Verify empty strings are preserved
    assert result["id_token"] == ""
    assert result["refresh_token"] == ""


@pytest.mark.parametrize(
    "response_json, expect_success, expected_expires_in, expected_error, contains",
    [
        # Success cases: expires_in coercion
        ({"access_token": "t", "expires_in": "3600"}, True, 3600, None, None),
        ({"access_token": "t", "expires_in": 3600}, True, 3600, None, None),
        ({"access_token": "t", "expires_in": 0}, True, 0, None, None),
        ({"access_token": "t", "expires_in": 999999999}, True, 999999999, None, None),  # Very large value

        # Error cases: missing/invalid access_token
        ({}, False, None, ApiError, "access_token"),
        ({"access_token": ""}, False, None, ApiError, "access_token"),
        ({"access_token": None}, False, None, ApiError, "access_token"),
        ({"access_token": 123}, False, None, ApiError, "access_token"),

        # Error cases: invalid expires_in
        ({"access_token": "t", "expires_in": "not-a-number"}, False, None, ApiError, "expires_in"),
        ({"access_token": "t", "expires_in": "x"}, False, None, ApiError, "expires_in"),
        ({"access_token": "t", "expires_in": "3600.5"}, False, None, ApiError, "expires_in"),  # String float rejected
        ({"access_token": "t", "expires_in": -100}, False, None, ApiError, "negative"),
    ],
    ids=[
        "expires_in_numeric_string",
        "expires_in_int",
        "expires_in_zero",
        "expires_in_very_large",
        "missing_access_token",
        "empty_access_token",
        "null_access_token",
        "wrong_type_access_token",
        "invalid_expires_in_string",
        "invalid_expires_in_char",
        "invalid_expires_in_float_string",
        "negative_expires_in",
    ]
)
@freeze_time("2024-01-15 12:00:00")
@pytest.mark.asyncio
async def test_token_response_parsing(
    mock_discovery, api_client_confidential, httpx_mock,
    response_json, expect_success, expected_expires_in, expected_error, contains
):
    """Test token endpoint response parsing and validation."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json=response_json
    )

    if expect_success:
        result = await api_client_confidential.get_token_by_exchange_profile(
            subject_token="t",
            subject_token_type="urn:x"
        )
        assert result["expires_in"] == expected_expires_in
        assert isinstance(result["expires_in"], int)
        assert result["access_token"] == "t"

        # Verify expires_at calculation (deterministic with frozen time)
        expected_expires_at = int(time.time()) + expected_expires_in
        assert result["expires_at"] == expected_expires_at
    else:
        with pytest.raises(expected_error) as err:
            await api_client_confidential.get_token_by_exchange_profile(
                subject_token="t",
                subject_token_type="urn:x"
            )
        assert err.value.status_code == 502
        assert contains in str(err.value).lower()


@pytest.mark.asyncio
async def test_token_endpoint_network_error(httpx_mock: HTTPXMock):
    """Test that network error (not timeout) raises ApiError."""
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT}
    )
    httpx_mock.add_exception(
        method="POST",
        url=TOKEN_ENDPOINT,
        exception=httpx.RequestError("Network unreachable", request=httpx.Request("POST", TOKEN_ENDPOINT))
    )

    api_client = ApiClient(ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret"
    ))

    with pytest.raises(ApiError) as err:
        await api_client.get_token_by_exchange_profile(
            subject_token="t",
            subject_token_type="urn:x"
        )
    assert err.value.code == "network_error"
    assert err.value.status_code == 502


@pytest.mark.parametrize(
    "call_kwargs, expected_fields, forbidden_fields",
    [
        (
            {"audience": "https://api.example.com"},
            {"audience": ["https://api.example.com"]},
            ["scope", "requested_token_type"]
        ),
        (
            {"scope": "openid profile", "requested_token_type": "urn:ietf:params:oauth:token-type:access_token"},
            {"scope": ["openid profile"], "requested_token_type": ["urn:ietf:params:oauth:token-type:access_token"]},
            []
        ),
        (
            {},  # No optional args
            {},
            ["audience", "scope", "requested_token_type"]
        ),
        (
            {"extra": {"device_id": "dev123", "roles": ["admin", "user"]}},
            {"device_id": ["dev123"], "roles": ["admin", "user"]},
            []
        ),
    ],
    ids=["with_audience", "with_scope_and_type", "no_optionals", "with_extra_params"]
)
@pytest.mark.asyncio
async def test_request_wiring(
    mock_discovery, api_client_confidential, httpx_mock,
    call_kwargs, expected_fields, forbidden_fields
):
    """Test that all optional and extra parameters are correctly wired into the form post."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json=token_success()
    )

    # Base args are constant
    base_args = {
        "subject_token": "t",
        "subject_token_type": "urn:x"
    }

    # Make the call
    await api_client_confidential.get_token_by_exchange_profile(
        **base_args,
        **call_kwargs
    )

    # Use the helper to check everything at once
    assert_form_post(
        httpx_mock,
        expect_fields={
            "grant_type": ["urn:ietf:params:oauth:grant-type:token-exchange"],
            "subject_token": ["t"],
            "subject_token_type": ["urn:x"],
            **expected_fields
        },
        forbid_fields=["client_id", "client_secret"] + forbidden_fields,
        expect_basic_auth=("cid", "csecret")
    )


@pytest.mark.asyncio
async def test_get_token_by_exchange_profile_timeout(httpx_mock: HTTPXMock):
    """Test timeout handling."""
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT}
    )
    httpx_mock.add_exception(httpx.TimeoutException("timeout"), method="POST")

    api_client = ApiClient(ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret"
    ))

    with pytest.raises(ApiError) as err:
        await api_client.get_token_by_exchange_profile(
            subject_token="token",
            subject_token_type="urn:example:type"
        )
    assert err.value.code == "timeout_error"
    assert err.value.status_code == 504

@pytest.mark.asyncio
async def test_get_token_by_exchange_profile_custom_timeout_honored(httpx_mock: HTTPXMock):
    """Test that custom timeout option is honored."""
    httpx_mock.add_response(
        method="GET",
        url=DISCOVERY_URL,
        json={"token_endpoint": TOKEN_ENDPOINT}
    )
    # Simulate slow response that will timeout with tiny timeout value
    httpx_mock.add_exception(httpx.TimeoutException("timeout"), method="POST")

    # Set very small timeout to prove the option is used
    api_client = ApiClient(ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
        client_id="cid",
        client_secret="csecret",
        timeout=0.001  # 1ms timeout
    ))

    with pytest.raises(ApiError) as err:
        await api_client.get_token_by_exchange_profile(
            subject_token="token",
            subject_token_type="urn:example:type"
        )
    assert err.value.code == "timeout_error"
    assert err.value.status_code == 504


@pytest.mark.asyncio
async def test_get_token_on_behalf_of_missing_client_credentials():
    """Test that OBO requires confidential client credentials."""
    api_client = ApiClient(ApiClientOptions(
        domain="auth0.local",
        audience="my-audience",
    ))

    with pytest.raises(GetTokenByExchangeProfileError) as err:
        await api_client.get_token_on_behalf_of(
            access_token="token",
            audience="https://api.backend.com"
        )

    assert "client credentials are required" in str(err.value).lower()


@pytest.mark.asyncio
async def test_get_token_on_behalf_of_missing_audience(api_client_confidential):
    """Test that OBO requires an explicit downstream audience."""
    with pytest.raises(MissingRequiredArgumentError):
        await api_client_confidential.get_token_on_behalf_of(
            access_token="token",
            audience=""
        )


@pytest.mark.asyncio
async def test_get_token_on_behalf_of_success(mock_discovery, api_client_confidential, httpx_mock):
    """Test successful OBO exchange with fixed access-token types."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json={
            "access_token": "obo-access-token",
            "expires_in": 3600,
            "scope": "read:data write:data",
            "token_type": "Bearer",
            "issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
        }
    )

    result = await api_client_confidential.get_token_on_behalf_of(
        access_token="incoming-access-token",
        audience="https://api.backend.com",
        scope="read:data write:data"
    )

    assert result["access_token"] == "obo-access-token"
    assert result["expires_in"] == 3600
    assert isinstance(result["expires_at"], int)
    assert result["scope"] == "read:data write:data"
    assert result["token_type"] == "Bearer"
    assert result["issued_token_type"] == "urn:ietf:params:oauth:token-type:access_token"

    assert_form_post(
        httpx_mock,
        expect_fields={
            "grant_type": ["urn:ietf:params:oauth:grant-type:token-exchange"],
            "subject_token": ["incoming-access-token"],
            "subject_token_type": ["urn:ietf:params:oauth:token-type:access_token"],
            "requested_token_type": ["urn:ietf:params:oauth:token-type:access_token"],
            "audience": ["https://api.backend.com"],
            "scope": ["read:data write:data"],
        },
        forbid_fields=["client_id", "client_secret"],
        expect_basic_auth=("cid", "csecret")
    )


@pytest.mark.asyncio
async def test_get_token_on_behalf_of_preserves_inferred_expires_at(
    api_client_confidential,
    monkeypatch,
):
    """Test that OBO reuses the expires_at inferred by the generic exchange path."""

    async def fake_exchange_profile(
        *,
        subject_token,
        subject_token_type,
        audience=None,
        scope=None,
        requested_token_type=None,
        extra=None,
    ):
        assert subject_token == "incoming-access-token"
        assert subject_token_type == "urn:ietf:params:oauth:token-type:access_token"
        assert requested_token_type == "urn:ietf:params:oauth:token-type:access_token"
        assert audience == "https://api.backend.com"
        assert scope is None
        assert extra is None

        return {
            "access_token": "obo-access-token",
            "expires_in": 3600,
            "expires_at": 1735693200,
            "token_type": "Bearer",
            "issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
        }

    monkeypatch.setattr(
        api_client_confidential,
        "get_token_by_exchange_profile",
        fake_exchange_profile,
    )

    result = await api_client_confidential.get_token_on_behalf_of(
        access_token="incoming-access-token",
        audience="https://api.backend.com",
    )

    assert result["access_token"] == "obo-access-token"
    assert result["expires_in"] == 3600
    assert result["expires_at"] == 1735693200
    assert result["token_type"] == "Bearer"
    assert result["issued_token_type"] == "urn:ietf:params:oauth:token-type:access_token"


@pytest.mark.asyncio
async def test_get_token_on_behalf_of_without_scope(mock_discovery, api_client_confidential, httpx_mock):
    """Test OBO exchange omits scope when not provided."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json=token_success(
            access_token="obo-access-token",
            issued_token_type="urn:ietf:params:oauth:token-type:access_token",
            token_type="Bearer",
        )
    )

    result = await api_client_confidential.get_token_on_behalf_of(
        access_token="incoming-access-token",
        audience="https://api.backend.com",
    )

    assert result["access_token"] == "obo-access-token"
    assert "scope" not in last_form(httpx_mock)


@pytest.mark.asyncio
async def test_get_token_on_behalf_of_does_not_expose_id_or_refresh_token(
    mock_discovery, api_client_confidential, httpx_mock
):
    """Test OBO result only exposes access-token-oriented fields."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        json={
            "access_token": "obo-access-token",
            "expires_in": 3600,
            "token_type": "Bearer",
            "issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
            "id_token": "id-token",
            "refresh_token": "refresh-token",
        }
    )

    result = await api_client_confidential.get_token_on_behalf_of(
        access_token="incoming-access-token",
        audience="https://api.backend.com",
    )

    assert result["access_token"] == "obo-access-token"
    assert "id_token" not in result
    assert "refresh_token" not in result


@pytest.mark.asyncio
async def test_get_token_on_behalf_of_api_error(mock_discovery, api_client_confidential, httpx_mock):
    """Test that OBO reuses the existing exchange error semantics."""
    httpx_mock.add_response(
        method="POST",
        url=TOKEN_ENDPOINT,
        status_code=400,
        json={
            "error": "invalid_target",
            "error_description": "The target API is not allowed"
        }
    )

    with pytest.raises(ApiError) as err:
        await api_client_confidential.get_token_on_behalf_of(
            access_token="incoming-access-token",
            audience="https://api.backend.com",
        )

    assert err.value.code == "invalid_target"
    assert err.value.status_code == 400


@pytest.mark.asyncio
async def test_get_token_on_behalf_of_empty_access_token(api_client_confidential):
    """Test that OBO validates the incoming access token via the shared exchange path."""
    with pytest.raises(MissingRequiredArgumentError):
        await api_client_confidential.get_token_on_behalf_of(
            access_token="",
            audience="https://api.backend.com",
        )


# ===== MCD (Multi-Custom Domain) Tests =====

@pytest.mark.asyncio
async def test_mcd_init_missing_domain_and_domains():
    """Test that providing neither domain nor domains raises ConfigurationError."""


    with pytest.raises(ConfigurationError) as err:
        _ = ApiClient(ApiClientOptions(audience="my-audience"))

    assert "Must provide either 'domain' or 'domains'" in str(err.value)


@pytest.mark.asyncio
async def test_mcd_init_with_domain_only():
    """Test that single domain mode works (backward compatible)."""
    api_client = ApiClient(ApiClientOptions(
        domain="auth0.local",
        audience="my-audience"
    ))

    assert api_client.options.domain == "auth0.local"
    assert api_client.options.domains is None
    assert api_client._allowed_domains is None


@pytest.mark.asyncio
async def test_mcd_init_with_domains_list():
    """Test that domains list is accepted and normalized."""
    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com", "TENANT2.AUTH0.COM", "https://tenant3.auth0.com/"],
        audience="my-audience"
    ))

    assert api_client.options.domains is not None
    assert api_client._allowed_domains == [
        "https://tenant1.auth0.com/",
        "https://tenant2.auth0.com/",
        "https://tenant3.auth0.com/"
    ]


@pytest.mark.asyncio
async def test_mcd_init_with_both_domain_and_domains():
    """Test that hybrid mode (both domain and domains) is valid."""
    api_client = ApiClient(ApiClientOptions(
        domain="auth0.local",
        domains=["tenant1.auth0.com", "tenant2.auth0.com"],
        audience="my-audience"
    ))

    # Both should be stored
    assert api_client.options.domain == "auth0.local"
    assert api_client.options.domains is not None
    assert api_client._allowed_domains == [
        "https://tenant1.auth0.com/",
        "https://tenant2.auth0.com/"
    ]


@pytest.mark.asyncio
async def test_mcd_init_with_empty_domains_list():
    """Test that empty domains list raises ConfigurationError."""


    with pytest.raises(ConfigurationError) as err:
        _ = ApiClient(ApiClientOptions(
            domains=[],
            audience="my-audience"
        ))

    assert "domains list cannot be empty" in str(err.value)


@pytest.mark.asyncio
async def test_mcd_init_with_domains_resolver():
    """Test that resolver function is accepted."""
    def my_resolver(context: dict) -> list[str]:
        return ["tenant1.auth0.com", "tenant2.auth0.com"]

    api_client = ApiClient(ApiClientOptions(
        domains=my_resolver,
        audience="my-audience"
    ))

    assert callable(api_client._allowed_domains)
    assert api_client._allowed_domains == my_resolver


@pytest.mark.asyncio
async def test_mcd_init_with_invalid_domains_type():
    """Test that invalid domains type raises ConfigurationError."""


    with pytest.raises(ConfigurationError) as err:
        _ = ApiClient(ApiClientOptions(
            domains="invalid-string",  # Should be list or callable
            audience="my-audience"
        ))

    assert "must be either a list" in str(err.value)


@pytest.mark.asyncio
async def test_mcd_init_with_non_string_domains_list():
    """Test that domains list with non-string items raises ConfigurationError."""
    with pytest.raises(ConfigurationError, match="non-empty strings"):
        ApiClient(ApiClientOptions(
            domains=[123, "tenant.auth0.com"],
            audience="my-audience"
        ))

    with pytest.raises(ConfigurationError, match="non-empty strings"):
        ApiClient(ApiClientOptions(
            domains=[None],
            audience="my-audience"
        ))

    with pytest.raises(ConfigurationError, match="non-empty strings"):
        ApiClient(ApiClientOptions(
            domains=["tenant.auth0.com", ""],
            audience="my-audience"
        ))


@pytest.mark.asyncio
async def test_mcd_init_client_id_requires_domain():
    """Test that client_id requires domain to be set (needed for token endpoint operations)."""
    with pytest.raises(ConfigurationError, match="'domain' parameter is required when 'client_id'"):
        ApiClient(ApiClientOptions(
            domains=["tenant.auth0.com"],
            client_id="my-client",
            client_secret="my-secret",
            audience="my-audience"
        ))

    # Should work with both domain and domains
    client = ApiClient(ApiClientOptions(
        domain="tenant.auth0.com",
        domains=["tenant.auth0.com", "custom.example.com"],
        client_id="my-client",
        client_secret="my-secret",
        audience="my-audience"
    ))
    assert client.options.client_id == "my-client"

    # Should work with domains only (no client_id)
    client = ApiClient(ApiClientOptions(
        domains=["tenant.auth0.com"],
        audience="my-audience"
    ))
    assert client._allowed_domains is not None


@pytest.mark.asyncio
async def test_cache_config_validation():
    """Test that cache_max_entries and cache_ttl_seconds are validated at init."""
    with pytest.raises(ConfigurationError, match="cache_ttl_seconds must be a non-negative number"):
        ApiClient(ApiClientOptions(
            domain="tenant.auth0.com",
            audience="my-audience",
            cache_ttl_seconds=-1
        ))

    with pytest.raises(ConfigurationError, match="cache_max_entries must be an integer greater than 1"):
        ApiClient(ApiClientOptions(
            domain="tenant.auth0.com",
            audience="my-audience",
            cache_max_entries=0
        ))

    with pytest.raises(ConfigurationError, match="cache_max_entries must be an integer greater than 1"):
        ApiClient(ApiClientOptions(
            domain="tenant.auth0.com",
            audience="my-audience",
            cache_max_entries=1
        ))

    with pytest.raises(ConfigurationError, match="cache_max_entries must be an integer greater than 1"):
        ApiClient(ApiClientOptions(
            domain="tenant.auth0.com",
            audience="my-audience",
            cache_max_entries=-5
        ))

    # cache_ttl_seconds=0 is valid (always refetch), cache_max_entries=2 is minimum
    client = ApiClient(ApiClientOptions(
        domain="tenant.auth0.com",
        audience="my-audience",
        cache_ttl_seconds=0,
        cache_max_entries=2
    ))
    assert client._cache_ttl == 0


@pytest.mark.asyncio
async def test_mcd_resolve_allowed_domains_static_list():
    """Test _resolve_allowed_domains with static list."""
    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com", "tenant2.auth0.com"],
        audience="my-audience"
    ))

    # Valid issuer
    result = await api_client._resolve_allowed_domains("https://tenant1.auth0.com/")
    assert result == ["https://tenant1.auth0.com/", "https://tenant2.auth0.com/"]

    # Invalid issuer
    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client._resolve_allowed_domains("https://unknown.auth0.com/")

    assert "not in the list of allowed domains" in str(err.value)


@pytest.mark.asyncio
async def test_mcd_resolve_allowed_domains_with_resolver():
    """Test _resolve_allowed_domains with dynamic resolver."""
    def my_resolver(context: dict) -> list[str]:
        # Return different domains based on issuer
        if "tenant1" in context['unverified_iss']:
            return ["tenant1.auth0.com"]
        return ["tenant2.auth0.com", "tenant3.auth0.com"]

    api_client = ApiClient(ApiClientOptions(
        domains=my_resolver,
        audience="my-audience"
    ))

    # Resolver allows tenant1
    result = await api_client._resolve_allowed_domains("https://tenant1.auth0.com/")
    assert result == ["https://tenant1.auth0.com/"]

    # Resolver allows tenant2
    result = await api_client._resolve_allowed_domains("https://tenant2.auth0.com/")
    assert result == ["https://tenant2.auth0.com/", "https://tenant3.auth0.com/"]


@pytest.mark.asyncio
async def test_mcd_resolve_allowed_domains_resolver_rejects():
    """Test that resolver can reject issuers by not including them."""
    def my_resolver(context: dict) -> list[str]:
        return ["tenant1.auth0.com"]  # Only allows tenant1

    api_client = ApiClient(ApiClientOptions(
        domains=my_resolver,
        audience="my-audience"
    ))

    # Resolver rejects tenant2
    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client._resolve_allowed_domains("https://tenant2.auth0.com/")

    assert "not in the list of allowed domains" in str(err.value)


@pytest.mark.asyncio
async def test_mcd_resolve_allowed_domains_resolver_error():
    """Test that resolver errors are wrapped in DomainsResolverError."""


    def failing_resolver(context: dict) -> list[str]:
        raise ValueError("Database connection failed")

    api_client = ApiClient(ApiClientOptions(
        domains=failing_resolver,
        audience="my-audience"
    ))

    with pytest.raises(DomainsResolverError) as err:
        await api_client._resolve_allowed_domains("https://tenant1.auth0.com/")

    assert "Domains resolver function failed" in str(err.value)
    assert "Database connection failed" in str(err.value)


@pytest.mark.asyncio
async def test_mcd_resolve_allowed_domains_resolver_invalid_return_type():
    """Test that resolver must return a list."""


    def bad_resolver(context: dict) -> str:
        return "tenant1.auth0.com"  # Should return list, not string

    api_client = ApiClient(ApiClientOptions(
        domains=bad_resolver,
        audience="my-audience"
    ))

    with pytest.raises(DomainsResolverError) as err:
        await api_client._resolve_allowed_domains("https://tenant1.auth0.com/")

    assert "must return a list" in str(err.value)


@pytest.mark.asyncio
async def test_mcd_resolve_allowed_domains_resolver_empty_list():
    """Test that resolver cannot return empty list."""


    def empty_resolver(context: dict) -> list[str]:
        return []

    api_client = ApiClient(ApiClientOptions(
        domains=empty_resolver,
        audience="my-audience"
    ))

    with pytest.raises(DomainsResolverError) as err:
        await api_client._resolve_allowed_domains("https://tenant1.auth0.com/")

    assert "returned an empty list" in str(err.value)


@pytest.mark.asyncio
async def test_mcd_resolve_allowed_domains_resolver_receives_context():
    """Test that resolver receives correct context with unverified_iss, request_url, and request_headers."""
    received_context = {}

    def context_capture_resolver(context: dict) -> list[str]:
        received_context.update(context)
        return ["tenant1.auth0.com"]

    api_client = ApiClient(ApiClientOptions(
        domains=context_capture_resolver,
        audience="my-audience"
    ))

    # Call with request_url and request_headers
    mock_url = "https://api.example.com/protected"
    mock_headers = {"host": "api.example.com", "user-agent": "test"}
    await api_client._resolve_allowed_domains(
        "https://tenant1.auth0.com/",
        request_url=mock_url,
        request_headers=mock_headers
    )

    # Verify context was passed correctly (matching TypeScript SDK structure)
    assert received_context['unverified_iss'] == "https://tenant1.auth0.com/"
    assert received_context['request_url'] == mock_url
    assert received_context['request_headers'] == mock_headers


@pytest.mark.asyncio
async def test_mcd_resolve_allowed_domains_single_domain_mode():
    """Test that single domain mode returns None from _resolve_allowed_domains."""
    api_client = ApiClient(ApiClientOptions(
        domain="auth0.local",
        audience="my-audience"
    ))

    # Single domain mode should return None
    result = await api_client._resolve_allowed_domains("https://auth0.local/")
    assert result is None


@pytest.mark.asyncio
async def test_mcd_async_resolver_success():
    """Test that async resolver functions are properly awaited."""
    async def async_resolver(context):
        return ["tenant1.auth0.com", "tenant2.auth0.com"]

    api_client = ApiClient(ApiClientOptions(
        domains=async_resolver,
        audience="my-audience"
    ))

    result = await api_client._resolve_allowed_domains(
        "https://tenant1.auth0.com/"
    )
    assert result == ["https://tenant1.auth0.com/", "https://tenant2.auth0.com/"]


@pytest.mark.asyncio
async def test_mcd_async_resolver_error():
    """Test that errors from async resolvers are wrapped in DomainsResolverError."""
    async def failing_resolver(context):
        raise RuntimeError("database connection lost")

    api_client = ApiClient(ApiClientOptions(
        domains=failing_resolver,
        audience="my-audience"
    ))

    with pytest.raises(DomainsResolverError, match="database connection lost"):
        await api_client._resolve_allowed_domains("https://tenant1.auth0.com/")


@pytest.mark.asyncio
async def test_mcd_resolver_returns_non_string_items():
    """Test that resolver returning non-string items raises DomainsResolverError."""
    def bad_resolver(context):
        return [123, None]

    api_client = ApiClient(ApiClientOptions(
        domains=bad_resolver,
        audience="my-audience"
    ))

    with pytest.raises(DomainsResolverError, match="non-empty strings"):
        await api_client._resolve_allowed_domains("https://tenant1.auth0.com/")


@pytest.mark.asyncio
async def test_mcd_resolver_returns_invalid_domain_format():
    """Test that resolver returning domains with invalid format raises DomainsResolverError."""
    def resolver_with_http(context):
        return ["tenant1.auth0.com", "http://invalid.com"]

    api_client = ApiClient(ApiClientOptions(
        domains=resolver_with_http,
        audience="my-audience"
    ))

    with pytest.raises(DomainsResolverError, match="Domains resolver returned invalid domain"):
        await api_client._resolve_allowed_domains("https://tenant1.auth0.com/")


@pytest.mark.asyncio
async def test_mcd_verify_rejects_symmetric_algorithm():
    """Test that verify_access_token rejects tokens with symmetric algorithms (HS256)."""
    # Create a token with HS256 algorithm in header (without actually signing it)
    header = {"alg": "HS256", "typ": "JWT", "kid": "test-key"}
    payload = {
        "iss": "https://tenant1.auth0.com/",
        "aud": "my-audience",
        "sub": "user123",
        "exp": 9999999999,
        "iat": 1000000000
    }

    # Encode header and payload (signature doesn't matter for this test)
    header_b64 = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip('=')
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')
    fake_signature = "fake_signature"
    hs256_token = f"{header_b64}.{payload_b64}.{fake_signature}"

    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com"],
        audience="my-audience"
    ))

    # Should reject immediately without network calls
    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_access_token(hs256_token)

    assert "Symmetric algorithm 'HS256' is not supported" in str(err.value)


@pytest.mark.asyncio
async def test_mcd_verify_early_issuer_validation(httpx_mock):
    """Test that issuer validation happens before JWKS fetch (performance optimization)."""
    # Generate token from disallowed issuer
    token = await generate_token(
        domain="disallowed-tenant.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://disallowed-tenant.auth0.com/"
    )

    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com", "tenant2.auth0.com"],
        audience="my-audience"
    ))

    # Mock should NOT be called because issuer validation happens first
    # If JWKS is fetched, test will fail because no mock is registered

    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_access_token(token)

    # Verify the error is about issuer not being allowed
    assert "not in the list of allowed domains" in str(err.value)

    # Verify no HTTP calls were made (JWKS fetch was skipped)
    assert len(httpx_mock.get_requests()) == 0


@pytest.mark.asyncio
async def test_mcd_discovery_uses_token_issuer(httpx_mock):
    """Test that discovery is fetched from token's issuer, not configured domain."""
    # Generate token from tenant1
    token = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    # Mock discovery for tenant1 (token's issuer)
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "https://tenant1.auth0.com/",
            "jwks_uri": "https://tenant1.auth0.com/.well-known/jwks.json"
        }
    )

    # Mock JWKS for tenant1
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/jwks.json",
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    # Create client with multiple domains
    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com", "tenant2.auth0.com"],
        audience="my-audience"
    ))

    # Verify token - should use tenant1's discovery
    claims = await api_client.verify_access_token(token)

    assert claims["sub"] == "user123"

    # Verify the correct discovery URL was called
    requests = httpx_mock.get_requests()
    discovery_requests = [r for r in requests if 'openid-configuration' in str(r.url)]
    assert len(discovery_requests) == 1
    assert str(discovery_requests[0].url) == "https://tenant1.auth0.com/.well-known/openid-configuration"


@pytest.mark.asyncio
async def test_mcd_first_issuer_validation(httpx_mock):
    """Test first issuer validation: token iss must match discovery issuer."""
    # Generate token with tenant1 issuer
    token = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    # Mock discovery that returns DIFFERENT issuer (attack scenario)
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "https://malicious.auth0.com/",  # Mismatch!
            "jwks_uri": "https://tenant1.auth0.com/.well-known/jwks.json"
        }
    )

    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com"],
        audience="my-audience"
    ))

    # Should fail at first issuer validation (before JWKS fetch)
    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_access_token(token)

    assert "token issuer does not match the discovery issuer" in str(err.value).lower()


@pytest.mark.asyncio
async def test_mcd_second_issuer_validation(httpx_mock):
    """Test second issuer validation: verified claims iss must match discovery issuer exactly.

    The first validation compares normalized issuers (case-insensitive, trailing slash).
    The second validation (post-signature) compares raw strings. This catches subtle
    mismatches that normalization hides — a defense-in-depth guard against token tampering.
    """
    # Generate token with MIXED CASE issuer — normalizes to same value as discovery
    # but raw string differs from discovery's lowercase issuer
    token = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://Tenant1.Auth0.Com"  # Mixed case, no trailing slash
    )

    # Mock discovery returning LOWERCASE issuer (standard Auth0 format)
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "https://tenant1.auth0.com/",  # Lowercase + trailing slash
            "jwks_uri": "https://tenant1.auth0.com/.well-known/jwks.json"
        }
    )

    # Mock JWKS (signature verification must pass for second check to be reached)
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/jwks.json",
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com"],
        audience="my-audience"
    ))

    # First validation passes (normalized forms match), but second validation
    # fails because raw claims["iss"] != discovery_issuer
    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_access_token(token)

    assert "verified token issuer does not match the discovery issuer" in str(err.value).lower()


@pytest.mark.asyncio
async def test_mcd_malformed_token_issuer_format(httpx_mock):
    """Test that a token with malformed iss claim raises VerifyAccessTokenError."""
    # Generate token with http:// issuer (rejected by normalize_domain)
    token = await generate_token(
        domain="evil.com",
        user_id="user123",
        audience="my-audience",
        issuer="http://evil.com"
    )

    api_client = ApiClient(ApiClientOptions(
        domain="tenant1.auth0.com",
        audience="my-audience"
    ))

    with pytest.raises(VerifyAccessTokenError, match="Invalid token issuer format"):
        await api_client.verify_access_token(token)


@pytest.mark.asyncio
async def test_mcd_malformed_discovery_issuer_format(httpx_mock):
    """Test that malformed issuer in discovery metadata raises VerifyAccessTokenError."""
    token = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    # Mock discovery returning malformed issuer with http://
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "http://tenant1.auth0.com/",
            "jwks_uri": "https://tenant1.auth0.com/.well-known/jwks.json"
        }
    )

    api_client = ApiClient(ApiClientOptions(
        domain="tenant1.auth0.com",
        audience="my-audience"
    ))

    with pytest.raises(VerifyAccessTokenError, match="Invalid discovery issuer format"):
        await api_client.verify_access_token(token)


@pytest.mark.asyncio
async def test_mcd_discovery_missing_issuer_field(httpx_mock):
    """Test that missing issuer field in discovery causes clear error."""
    token = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    # Mock discovery WITHOUT issuer field
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "jwks_uri": "https://tenant1.auth0.com/.well-known/jwks.json"
            # Missing "issuer" field
        }
    )

    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com"],
        audience="my-audience"
    ))

    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_access_token(token)

    assert "missing 'issuer' field" in str(err.value).lower()


@pytest.mark.asyncio
async def test_mcd_discovery_missing_jwks_uri_field(httpx_mock):
    """Test that missing jwks_uri field in discovery causes clear error."""
    token = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    # Mock discovery WITHOUT jwks_uri field
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "https://tenant1.auth0.com/"
            # Missing "jwks_uri" field
        }
    )

    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com"],
        audience="my-audience"
    ))

    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_access_token(token)

    assert "missing 'jwks_uri' field" in str(err.value).lower()


@pytest.mark.asyncio
async def test_mcd_jwks_fetched_from_issuer_jwks_uri(httpx_mock):
    """Test that JWKS is fetched from issuer-specific jwks_uri in discovery metadata."""
    # Generate token from tenant1
    token = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    # Mock discovery for tenant1 with specific jwks_uri
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "https://tenant1.auth0.com/",
            "jwks_uri": "https://tenant1.auth0.com/.well-known/jwks.json"  # Tenant-specific
        }
    )

    # Mock JWKS for tenant1
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/jwks.json",
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com", "tenant2.auth0.com"],
        audience="my-audience"
    ))

    # Verify token - should fetch JWKS from tenant1's specific URI
    claims = await api_client.verify_access_token(token)

    assert claims["sub"] == "user123"

    # Verify JWKS was fetched from tenant1's specific URI
    requests = httpx_mock.get_requests()
    jwks_requests = [r for r in requests if 'jwks.json' in str(r.url)]
    assert len(jwks_requests) == 1
    assert str(jwks_requests[0].url) == "https://tenant1.auth0.com/.well-known/jwks.json"


@pytest.mark.asyncio
async def test_mcd_signature_verification_with_correct_key(httpx_mock):
    """Test that signature verification uses the correct public key based on token's kid."""
    # Generate token
    token = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    # Mock discovery
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "https://tenant1.auth0.com/",
            "jwks_uri": "https://tenant1.auth0.com/.well-known/jwks.json"
        }
    )

    # Mock JWKS with multiple keys - correct key is TEST_KEY
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/jwks.json",
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "OTHER_KEY",  # Different key
                    "n": "different_modulus_value",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                },
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",  # Correct key (matches token)
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com"],
        audience="my-audience"
    ))

    # Should successfully verify using TEST_KEY (not OTHER_KEY)
    claims = await api_client.verify_access_token(token)

    assert claims["sub"] == "user123"


@pytest.mark.asyncio
async def test_mcd_jwks_no_matching_kid(httpx_mock):
    """Test clear error when token's kid not found in JWKS."""
    # Generate token (will have kid="TEST_KEY")
    token = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    # Mock discovery
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "https://tenant1.auth0.com/",
            "jwks_uri": "https://tenant1.auth0.com/.well-known/jwks.json"
        }
    )

    # Mock JWKS with keys that DON'T match token's kid
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/jwks.json",
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "DIFFERENT_KEY",  # Doesn't match token's kid
                    "n": "some_modulus",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                },
                {
                    "kty": "RSA",
                    "kid": "ANOTHER_KEY",  # Also doesn't match
                    "n": "another_modulus",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com"],
        audience="my-audience"
    ))

    # Should fail with clear error about missing kid
    with pytest.raises(VerifyAccessTokenError) as err:
        await api_client.verify_access_token(token)

    assert "no matching key found in jwks" in str(err.value).lower()


@pytest.mark.asyncio
async def test_mcd_discovery_cached_per_issuer(httpx_mock):
    """Test that discovery metadata is cached per issuer."""
    # Generate tokens from two different issuers
    token1 = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    token2 = await generate_token(
        domain="tenant2.auth0.com",
        user_id="user456",
        audience="my-audience",
        issuer="https://tenant2.auth0.com/"
    )

    # Mock discovery for tenant1
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "https://tenant1.auth0.com/",
            "jwks_uri": "https://tenant1.auth0.com/.well-known/jwks.json"
        }
    )

    # Mock JWKS for tenant1
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/jwks.json",
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    # Mock discovery for tenant2
    httpx_mock.add_response(
        method="GET",
        url="https://tenant2.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "https://tenant2.auth0.com/",
            "jwks_uri": "https://tenant2.auth0.com/.well-known/jwks.json"
        }
    )

    # Mock JWKS for tenant2
    httpx_mock.add_response(
        method="GET",
        url="https://tenant2.auth0.com/.well-known/jwks.json",
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com", "tenant2.auth0.com"],
        audience="my-audience"
    ))

    # Verify both tokens - should cache separately
    claims1 = await api_client.verify_access_token(token1)
    claims2 = await api_client.verify_access_token(token2)

    assert claims1["sub"] == "user123"
    assert claims2["sub"] == "user456"

    # Verify both discovery endpoints were called
    requests = httpx_mock.get_requests()
    discovery_requests = [r for r in requests if 'openid-configuration' in str(r.url)]
    assert len(discovery_requests) == 2


@pytest.mark.asyncio
async def test_mcd_discovery_cache_hit(httpx_mock):
    """Test that second request for same issuer uses cached discovery."""
    # Generate two tokens from same issuer
    token1 = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    token2 = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user456",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    # Mock discovery for tenant1 (only once)
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "https://tenant1.auth0.com/",
            "jwks_uri": "https://tenant1.auth0.com/.well-known/jwks.json"
        }
    )

    # Mock JWKS for tenant1 (only once)
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/jwks.json",
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com"],
        audience="my-audience"
    ))

    # Verify first token - fetches from network
    claims1 = await api_client.verify_access_token(token1)
    assert claims1["sub"] == "user123"

    # Verify second token - should use cache (no additional HTTP calls)
    claims2 = await api_client.verify_access_token(token2)
    assert claims2["sub"] == "user456"

    # Verify discovery was only called once
    requests = httpx_mock.get_requests()
    discovery_requests = [r for r in requests if 'openid-configuration' in str(r.url)]
    assert len(discovery_requests) == 1

    # Verify JWKS was only called once
    jwks_requests = [r for r in requests if 'jwks.json' in str(r.url)]
    assert len(jwks_requests) == 1


@pytest.mark.asyncio
async def test_mcd_jwks_cached_per_uri(httpx_mock):
    """Test that JWKS is cached per URI."""
    token = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    # Mock discovery
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "https://tenant1.auth0.com/",
            "jwks_uri": "https://tenant1.auth0.com/.well-known/jwks.json"
        }
    )

    # Mock JWKS
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/jwks.json",
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com"],
        audience="my-audience"
    ))

    # Verify token
    claims = await api_client.verify_access_token(token)
    assert claims["sub"] == "user123"

    # Verify cache key is based on jwks_uri
    cache_key = "https://tenant1.auth0.com/.well-known/jwks.json"
    cached_jwks = api_client._jwks_cache.get(cache_key)
    assert cached_jwks is not None
    assert "keys" in cached_jwks


@pytest.mark.asyncio
async def test_mcd_jwks_cache_hit(httpx_mock):
    """Test that multiple tokens use cached JWKS."""
    token1 = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    token2 = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user456",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    # Mock discovery (once)
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "https://tenant1.auth0.com/",
            "jwks_uri": "https://tenant1.auth0.com/.well-known/jwks.json"
        }
    )

    # Mock JWKS (once)
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/jwks.json",
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com"],
        audience="my-audience"
    ))

    # Verify both tokens
    claims1 = await api_client.verify_access_token(token1)
    claims2 = await api_client.verify_access_token(token2)

    assert claims1["sub"] == "user123"
    assert claims2["sub"] == "user456"

    # Verify JWKS was only fetched once
    requests = httpx_mock.get_requests()
    jwks_requests = [r for r in requests if 'jwks.json' in str(r.url)]
    assert len(jwks_requests) == 1


@pytest.mark.asyncio
async def test_mcd_cache_max_entries_configuration(httpx_mock):
    """Test that cache_max_entries configuration is respected."""
    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com", "tenant2.auth0.com"],
        audience="my-audience",
        cache_max_entries=2
    ))

    # Verify both caches have correct max_entries
    assert api_client._discovery_cache._max_entries == 2
    assert api_client._jwks_cache._max_entries == 2

    # Test with default value
    api_client_default = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com"],
        audience="my-audience"
    ))

    assert api_client_default._discovery_cache._max_entries == 100
    assert api_client_default._jwks_cache._max_entries == 100


@pytest.mark.asyncio
@pytest.mark.parametrize("max_age_header,configured_ttl,expected_ttl", [
    ("max-age=60", 600, 60),
    ("max-age=3600", 600, 600),
    (None, 600, 600),
])
async def test_effective_ttl_from_cache_control(httpx_mock, max_age_header, configured_ttl, expected_ttl):
    """Test that effective TTL respects min(max_age, configured_ttl)."""

    token = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    discovery_headers = {"cache-control": max_age_header} if max_age_header else {}
    jwks_headers = {"cache-control": max_age_header} if max_age_header else {}

    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "https://tenant1.auth0.com/",
            "jwks_uri": "https://tenant1.auth0.com/.well-known/jwks.json"
        },
        headers=discovery_headers,
    )

    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/jwks.json",
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        },
        headers=jwks_headers,
    )

    api_client = ApiClient(ApiClientOptions(
        domains=["tenant1.auth0.com"],
        audience="my-audience",
        cache_ttl_seconds=configured_ttl,
    ))

    before = time.monotonic()
    await api_client.verify_access_token(token)

    # Inspect discovery cache entry expiry
    discovery_key = "https://tenant1.auth0.com/"
    _, discovery_expiry = api_client._discovery_cache._cache[discovery_key]
    discovery_ttl = discovery_expiry - before
    assert abs(discovery_ttl - expected_ttl) < 2

    # Inspect JWKS cache entry expiry
    jwks_key = "https://tenant1.auth0.com/.well-known/jwks.json"
    _, jwks_expiry = api_client._jwks_cache._cache[jwks_key]
    jwks_ttl = jwks_expiry - before
    assert abs(jwks_ttl - expected_ttl) < 2


# ===== MCD: verify_request() Integration =====


@pytest.mark.asyncio
async def test_mcd_verify_request_with_resolver_context(httpx_mock):
    """Test that verify_request() forwards request_url and request_headers to the resolver.

    This tests the actual user-facing API path: verify_request() → verify_access_token()
    → _resolve_allowed_domains() with resolver context populated from verify_request args.
    """
    received_contexts = []

    def capturing_resolver(context):
        """Resolver that captures the context it receives."""
        received_contexts.append(context)
        return ["tenant1.auth0.com"]

    token = await generate_token(
        domain="tenant1.auth0.com",
        user_id="user123",
        audience="my-audience",
        issuer="https://tenant1.auth0.com/"
    )

    # Mock discovery
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/openid-configuration",
        json={
            "issuer": "https://tenant1.auth0.com/",
            "jwks_uri": "https://tenant1.auth0.com/.well-known/jwks.json"
        }
    )

    # Mock JWKS
    httpx_mock.add_response(
        method="GET",
        url="https://tenant1.auth0.com/.well-known/jwks.json",
        json={
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "TEST_KEY",
                    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
                    "e": "AQAB",
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }
    )

    api_client = ApiClient(ApiClientOptions(
        domains=capturing_resolver,
        audience="my-audience"
    ))

    request_headers = {
        "authorization": f"Bearer {token}",
        "x-custom-header": "test-value"
    }

    claims = await api_client.verify_request(
        headers=request_headers,
        http_url="https://api.example.com/users"
    )

    assert claims["sub"] == "user123"

    # Verify the resolver received the correct context
    assert len(received_contexts) == 1
    ctx = received_contexts[0]
    assert ctx["request_url"] == "https://api.example.com/users"
    assert ctx["request_headers"]["authorization"] == f"Bearer {token}"
    assert ctx["request_headers"]["x-custom-header"] == "test-value"
    assert ctx["unverified_iss"] == "https://tenant1.auth0.com/"
