# Auth0 API Python Examples

This document provides examples for using the `auth0-api-python` package to validate Auth0 tokens in your API.

## On Behalf Of Token Exchange

Use `get_token_on_behalf_of()` when your API receives an `Auth0` access token for itself and needs
to exchange it for another `Auth0` access token targeting a downstream API while preserving the same
user identity. This is especially useful for `MCP` servers and other intermediary APIs that need to
call downstream APIs on behalf of the user.

The following example verifies the incoming access token for your API, exchanges it for a token for the downstream API, and then calls the downstream API with the exchanged token.

```python
import asyncio
import httpx

from auth0_api_python import ApiClient, ApiClientOptions

async def exchange_on_behalf_of():
    api_client = ApiClient(ApiClientOptions(
        domain="your-tenant.auth0.com",
        audience="https://mcp-server.example.com",
        client_id="<AUTH0_CLIENT_ID>",
        client_secret="<AUTH0_CLIENT_SECRET>"
    ))

    incoming_access_token = "incoming-auth0-access-token"

    claims = await api_client.verify_access_token(access_token=incoming_access_token)

    result = await api_client.get_token_on_behalf_of(
        access_token=incoming_access_token,
        audience="https://calendar-api.example.com",
        scope="calendar:read calendar:write"
    )

    async with httpx.AsyncClient() as client:
        downstream_response = await client.get(
            "https://calendar-api.example.com/events",
            headers={"Authorization": f"Bearer {result['access_token']}"}
        )

    downstream_response.raise_for_status()

    return {
        "user": claims["sub"],
        "data": downstream_response.json(),
    }

asyncio.run(exchange_on_behalf_of())
```

> [!TIP] Production notes:
> - Pass the raw access token to `get_token_on_behalf_of()`. Do not pass the full `Authorization` header or include the `Bearer ` prefix.
> - Verify the incoming token for your API before exchanging it so your application rejects invalid or mis-targeted tokens early.
> - The downstream `audience` must match an API identifier configured in your Auth0 tenant.
> - `get_token_on_behalf_of()` only returns access-token-oriented fields. It does not expose `id_token` or `refresh_token`.

In the current implementation, `get_token_on_behalf_of()` forwards the incoming access token as
the [RFC 8693](https://datatracker.ietf.org/doc/html/rfc8693#section-2.1) `subject_token` and relies on Auth0 to handle any DPoP-specific behavior for that token.

## Inspecting Delegation After Token Verification

When a downstream API or `MCP` server receives an access token that may have been issued through
delegation, it can verify the token first and then inspect the `act` claim to identify the current
actor for authorization and the full delegation chain for audit or attribution.

```python
import asyncio
import logging

from auth0_api_python import (
    ApiClient,
    ApiClientOptions,
    get_current_actor,
    get_delegation_chain,
)

logger = logging.getLogger(__name__)

async def inspect_delegated_token():
    api_client = ApiClient(ApiClientOptions(
        domain="your-tenant.auth0.com",
        audience="https://calendar-api.example.com"
    ))

    access_token = "delegated-auth0-access-token"

    claims = await api_client.verify_access_token(access_token=access_token)

    current_actor = get_current_actor(claims)
    delegation_chain = get_delegation_chain(claims)

    if current_actor != "mcp_server_client_id":
        raise PermissionError("unexpected actor")

    logger.info(
        "delegated request",
        extra={
            "user_sub": claims["sub"],
            "current_actor": current_actor,
            "delegation_chain": delegation_chain,
        },
    )

    return {
        "user_sub": claims["sub"],
        "current_actor": current_actor,
        "delegation_chain": delegation_chain,
    }

asyncio.run(inspect_delegated_token())
```

Only the outermost `act.sub` represents the current actor and should be used for authorization
decisions. Nested `act` values represent prior actors and are better suited for logging, audit, or
attribution.

## Bearer Authentication

Bearer authentication is the standard OAuth 2.0 token authentication method.

### Using verify_access_token

```python
import asyncio
from auth0_api_python import ApiClient, ApiClientOptions

async def validate_bearer_token(headers):
    api_client = ApiClient(ApiClientOptions(
        domain="your-tenant.auth0.com",
        audience="https://api.example.com"
    ))
    
    try:
        # Extract the token from the Authorization header
        auth_header = headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return {"error": "Missing or invalid authorization header"}, 401
            
        token = auth_header.split(" ")[1]
        
        # Verify the access token
        claims = await api_client.verify_access_token(token)
        return {"success": True, "user": claims["sub"]}
    except Exception as e:
        return {"error": str(e)}, getattr(e, "get_status_code", lambda: 401)()

# Example usage
headers = {"authorization": "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."}
result = asyncio.run(validate_bearer_token(headers))
```

### Using verify_request

```python
import asyncio
from auth0_api_python import ApiClient, ApiClientOptions
from auth0_api_python.errors import BaseAuthError

async def validate_request(headers):
    api_client = ApiClient(ApiClientOptions(
        domain="your-tenant.auth0.com",
        audience="https://api.example.com"
    ))
    
    try:
        # Verify the request with Bearer token
        claims = await api_client.verify_request(
            headers=headers
        )
        return {"success": True, "user": claims["sub"]}
    except BaseAuthError as e:
        return {"error": str(e)}, e.get_status_code(), e.get_headers()

# Example usage
headers = {"authorization": "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."}
result = asyncio.run(validate_request(headers))
```


## DPoP Authentication 

[DPoP](https://www.rfc-editor.org/rfc/rfc9449.html) (Demonstrating Proof of Posession) is an application-level mechanism for sender-constraining OAuth 2.0 access and refresh tokens by proving that the client application is in possession of a certain private key.

This guide covers the DPoP implementation in `auth0-api-python` with complete examples for both operational modes.

For more information about DPoP specification, see [RFC 9449](https://tools.ietf.org/html/rfc9449).

## Configuration Modes

### 1. Allowed Mode (Default)
```python
from auth0_api_python import ApiClient, ApiClientOptions

api_client = ApiClient(ApiClientOptions(
    domain="your-tenant.auth0.com",
    audience="https://api.example.com",
    dpop_enabled=True,      # Default: enables DPoP support
    dpop_required=False     # Default: allows both Bearer and DPoP
))
```

### 2. Required Mode
```python
api_client = ApiClient(ApiClientOptions(
    domain="your-tenant.auth0.com",
    audience="https://api.example.com",
    dpop_required=True      # Enforces DPoP-only authentication
))
```

## Getting Started

### Basic Usage with verify_request()

The `verify_request()` method automatically detects the authentication scheme:

```python
import asyncio
from auth0_api_python import ApiClient, ApiClientOptions

async def handle_api_request(headers, http_method, http_url):
    api_client = ApiClient(ApiClientOptions(
        domain="your-tenant.auth0.com",
        audience="https://api.example.com"
    ))
    
    try:
        # Automatically handles both Bearer and DPoP schemes
        claims = await api_client.verify_request(
            headers=headers,
            http_method=http_method,
            http_url=http_url
        )
        return {"success": True, "user": claims["sub"]}
    except Exception as e:
        return {"error": str(e)}, e.get_status_code()

# Example usage
headers = {
    "authorization": "DPoP eyJ0eXAiOiJKV1Q...",
    "dpop": "eyJ0eXAiOiJkcG9wK2p3dC..."
}
result = asyncio.run(handle_api_request(headers, "GET", "https://api.example.com/data"))
```

### Direct DPoP Proof Verification

For more control, use `verify_dpop_proof()` directly:

```python
async def verify_dpop_token(access_token, dpop_proof, http_method, http_url):
    api_client = ApiClient(ApiClientOptions(
        domain="your-tenant.auth0.com",
        audience="https://api.example.com"
    ))
    
    # First verify the access token
    token_claims = await api_client.verify_access_token(access_token)
    
    # Then verify the DPoP proof
    proof_claims = await api_client.verify_dpop_proof(
        access_token=access_token,
        proof=dpop_proof,
        http_method=http_method,
        http_url=http_url
    )
    
    return {
        "token_claims": token_claims,
        "proof_claims": proof_claims
    }
```
