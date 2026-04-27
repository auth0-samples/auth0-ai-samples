The `auth0-api-python` library allows you to secure APIs running on Python, particularly for verifying Auth0-issued access tokens.

It’s intended as a foundation for building more framework-specific integrations (e.g., with FastAPI, Django, etc.), but you can also use it directly in any Python server-side environment.

![Release](https://img.shields.io/pypi/v/auth0-api-python) ![Downloads](https://img.shields.io/pypi/dw/auth0-api-python) [![License](https://img.shields.io/:license-MIT-blue.svg?style=flat)](https://opensource.org/licenses/MIT)

📚 [Documentation](#documentation) - 🚀 [Getting Started](#getting-started) - 💬 [Feedback](#feedback)

## Features & Authentication Schemes

This SDK provides comprehensive support for securing APIs with Auth0-issued access tokens:

### **Authentication Schemes**
- **Bearer Token Authentication** - Traditional OAuth 2.0 Bearer tokens (RS256)
- **DPoP Authentication** - Enhanced security with Demonstrating Proof-of-Possession (ES256)
- **Mixed Mode Support** - Seamlessly handles both Bearer and DPoP in the same API

### **Core Features**
- **Unified Entry Point**: `verify_request()` - automatically detects and validates Bearer or DPoP schemes
- **Multi-Custom Domain (MCD)** - Accept tokens from multiple Auth0 domains with static lists or dynamic resolvers
- **OIDC Discovery** - Automatic fetching of Auth0 metadata and JWKS with per-issuer caching
- **JWT Validation** - Complete RS256 signature verification with claim validation
- **DPoP Proof Verification** - Full RFC 9449 compliance with ES256 signature validation
- **Flexible Configuration** - Support for both "Allowed" and "Required" DPoP modes
- **Comprehensive Error Handling** - Detailed errors with proper HTTP status codes and WWW-Authenticate headers
- **Framework Agnostic** - Works with FastAPI, Django, Flask, or any Python web framework

## Documentation

- [Docs Site](https://auth0.com/docs) - explore our docs site and learn more about Auth0.

## Related SDKs

This library is part of Auth0's Python ecosystem for server-side authentication and API security. Related SDKs:

- **[auth0-auth-js](https://github.com/auth0/auth0-auth-js)** - JavaScript/TypeScript monorepo containing:
  - `@auth0/auth0-auth-js` - Core authentication client (low-level primitives)
  - `@auth0/auth0-api-js` - Server-side API security (Node.js equivalent of this library)
  - `@auth0/auth0-server-js` - Server-side web app authentication (session management)

## Getting Started

### 1. Install the SDK

_This library requires Python 3.9+._

```shell
pip install auth0-api-python
```

If you’re using Poetry:

```shell
poetry install auth0-api-python
```

### 2. Create the Auth0 SDK client

Create an instance of the `ApiClient`. This instance will be imported and used anywhere we need access to the methods.

```python 
from auth0_api_python import ApiClient, ApiClientOptions


api_client = ApiClient(ApiClientOptions(
    domain="<AUTH0_DOMAIN>",
    audience="<AUTH0_AUDIENCE>"
))
```

- The `AUTH0_DOMAIN` can be obtained from the [Auth0 Dashboard](https://manage.auth0.com) once you've created an application.
- The `AUTH0_AUDIENCE` is the identifier of the API. You can find this in the [APIs section of the Auth0 Dashboard](https://manage.auth0.com/#/apis/).

### 3. Verify the Access Token

Use the `verify_access_token` method to validate access tokens. The method automatically checks critical claims like `iss`, `aud`, `exp`, `nbf`.

```python
import asyncio

from auth0_api_python import ApiClient, ApiClientOptions

async def main():
    api_client = ApiClient(ApiClientOptions(
        domain="<AUTH0_DOMAIN>",
        audience="<AUTH0_AUDIENCE>"
    ))
    access_token = "..."

    decoded_and_verified_token = await api_client.verify_access_token(access_token=access_token)
    print(decoded_and_verified_token)

asyncio.run(main())
```

In this example, the returned dictionary contains the decoded claims (like `sub`, `scope`, etc.) from the verified token.

### 4. Get an access token for a connection

If you need to get an access token for an upstream idp via a connection, you can use the `get_access_token_for_connection` method:

```python
import asyncio

from auth0_api_python import ApiClient, ApiClientOptions

async def main():
    api_client = ApiClient(ApiClientOptions(
        domain="<AUTH0_DOMAIN>",
        audience="<AUTH0_AUDIENCE>",
        client_id="<AUTH0_CLIENT_ID>",
        client_secret="<AUTH0_CLIENT_SECRET>",
    ))
    connection = "my-connection" # The Auth0 connection to the upstream idp
    access_token = "..." # The Auth0 access token to exchange

    connection_access_token = await api_client.get_access_token_for_connection({"connection": connection, "access_token": access_token})
    # The returned token is the access token for the upstream idp
    print(connection_access_token)

asyncio.run(main())
```

More info https://auth0.com/docs/secure/tokens/token-vault

### 5. Custom Token Exchange (Early Access)

> [!NOTE]
> This feature is currently available in [Early Access](https://auth0.com/docs/troubleshoot/product-lifecycle/product-release-stages#early-access) for Enterprise customers. Please reach out to Auth0 support to get it enabled for your tenant.

This feature requires a [confidential client](https://auth0.com/docs/get-started/applications/confidential-and-public-applications#confidential-applications) (both `client_id` and `client_secret` must be configured).

Custom Token Exchange allows you to exchange a subject token for Auth0 tokens using RFC 8693. This is useful for:
- Getting Auth0 tokens for another audience
- Integrating external identity providers
- Migrating to Auth0

```python
import asyncio

from auth0_api_python import ApiClient, ApiClientOptions

async def main():
    api_client = ApiClient(ApiClientOptions(
        domain="<AUTH0_DOMAIN>",
        audience="<AUTH0_AUDIENCE>",
        client_id="<AUTH0_CLIENT_ID>",
        client_secret="<AUTH0_CLIENT_SECRET>",
        timeout=10.0  # Optional: HTTP timeout in seconds (default: 10.0)
    ))

    subject_token = "..."  # Token from your legacy system or external source

    result = await api_client.get_token_by_exchange_profile(
        subject_token=subject_token,
        subject_token_type="urn:example:subject-token",
        audience="https://api.example.com",  # Optional - omit if your Action or tenant configuration sets the audience
        scope="openid profile email",  # Optional
        requested_token_type="urn:ietf:params:oauth:token-type:access_token"  # Optional
    )

    # Result contains access_token, expires_in, expires_at
    # id_token, refresh_token, and scope are profile/Action dependent (not guaranteed; scope may be empty)

asyncio.run(main())
```

**Important:**
- Client authentication is sent via HTTP Basic (`client_id`/`client_secret`), not in the form body.
- Do not prefix `subject_token` with "Bearer " - send the raw token value only (checked case-insensitively).
- The `subject_token_type` must match a Token Exchange Profile configured in Auth0. This URI identifies which profile will process the exchange and **must not use reserved OAuth namespaces (IETF or vendor-controlled)**. Use your own collision-resistant namespace. See the [Custom Token Exchange documentation](https://auth0.com/docs/authenticate/custom-token-exchange) for naming guidance.
- If neither an explicit `audience` nor tenant/Action logic sets it, you may receive a token not targeted at your API.

#### Additional Parameters

You can pass additional parameters for your Token Exchange Profile or Actions via the `extra` parameter. These are sent as form fields to Auth0 and may be inspected by Actions:

```python
result = await api_client.get_token_by_exchange_profile(
    subject_token=subject_token,
    subject_token_type="urn:example:subject-token",
    audience="https://api.example.com",
    extra={
        "device_id": "device-12345",
        "session_id": "sess-abc"
    }
)
```

> [!WARNING]
> Extra parameters are sent as form fields and may appear in logs. Do not include secrets or sensitive data. Reserved OAuth parameter names (like `grant_type`, `client_id`, `scope`) cannot be used and will raise an error. Arrays are supported but limited to 20 values per key to prevent abuse.

#### Error Handling

```python
from auth0_api_python import GetTokenByExchangeProfileError, ApiError

try:
    result = await api_client.get_token_by_exchange_profile(
        subject_token=subject_token,
        subject_token_type="urn:example:subject-token"
    )
except GetTokenByExchangeProfileError as e:
    # Validation errors (invalid token format, missing credentials, reserved params, etc.)
    print(f"Validation error: {e}")
except ApiError as e:
    # Token endpoint errors (invalid_grant, network issues, malformed responses, etc.)
    print(f"API error: {e.code} - {e.message} (status: {e.status_code})")
```

**Related SDKs:** [auth0-auth-js](https://github.com/auth0/auth0-auth-js) (see `@auth0/auth0-api-js` package for Node.js equivalent)

More info: https://auth0.com/docs/authenticate/custom-token-exchange

#### On Behalf Of Token Exchange

Use `get_token_on_behalf_of()` when your API receives an `Auth0` access token for itself and needs
to exchange it for another `Auth0` access token targeting a downstream API while preserving the
same user identity. This is especially useful for `MCP` servers and other intermediary APIs that
need to call downstream APIs on behalf of the user.

The following example verifies the incoming access token for your API, exchanges it for a token for the downstream API, and then calls the downstream API with the exchanged token.

```python
import httpx

async def handle_calendar_request(incoming_access_token: str):
    await api_client.verify_access_token(access_token=incoming_access_token)

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

    return downstream_response.json()
```

The OBO wrapper reuses the existing RFC 8693 exchange support and fixes both token-type parameters
to Auth0 access-token exchange. In the current implementation, the SDK forwards the incoming access
token as the `subject_token` and relies on Auth0 to handle any DPoP-specific behavior for that token.
The OBO result only includes access-token-oriented fields. It does not expose `id_token` or
`refresh_token`.

#### Inspecting Delegation After Token Verification

When a downstream API or `MCP` server receives an access token that may have been issued through
delegation, it can verify the token first and then inspect the `act` claim to identify the current
actor for authorization and the full delegation chain for logging or audit.

```python
import logging

from auth0_api_python import (
    ApiClient,
    ApiClientOptions,
    get_current_actor,
    get_delegation_chain,
)

logger = logging.getLogger(__name__)

api_client = ApiClient(ApiClientOptions(
    domain="<AUTH0_DOMAIN>",
    audience="<AUTH0_AUDIENCE>",
))

async def authorize_delegated_request(access_token: str):
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

    return claims
```

Only the outermost `act.sub` represents the current actor and should be used for authorization
decisions. Nested `act` values represent prior actors in the delegation chain and are better suited
for logging, audit, or attribution.

#### Requiring Additional Claims

If your application demands extra claims, specify them with `required_claims`:

```python
decoded_and_verified_token = await api_client.verify_access_token(
    access_token=access_token,
    required_claims=["my_custom_claim"]
)
```

If the token lacks `my_custom_claim` or fails any standard check (issuer mismatch, expired token, invalid signature), the method raises a `VerifyAccessTokenError`.

### 6. DPoP Authentication

This library supports **DPoP (Demonstrating Proof-of-Possession)** for enhanced security, allowing clients to prove possession of private keys bound to access tokens.

#### Allowed Mode (Default)

Accepts both Bearer and DPoP tokens - ideal for gradual migration:

```python
api_client = ApiClient(ApiClientOptions(
    domain="<AUTH0_DOMAIN>",
    audience="<AUTH0_AUDIENCE>",
    dpop_enabled=True,      # Default - enables DPoP support
    dpop_required=False     # Default - allows both Bearer and DPoP
))

# Use verify_request() for automatic scheme detection
result = await api_client.verify_request(
    headers={
        "authorization": "DPoP eyJ0eXAiOiJKV1Q...",  # DPoP scheme
        "dpop": "eyJ0eXAiOiJkcG9wK2p3dC...",        # DPoP proof
    },
    http_method="GET",
    http_url="https://api.example.com/resource"
)
```

#### Required Mode

Enforces DPoP-only authentication, rejecting Bearer tokens:

```python
api_client = ApiClient(ApiClientOptions(
    domain="<AUTH0_DOMAIN>",
    audience="<AUTH0_AUDIENCE>", 
    dpop_required=True      # Rejects Bearer tokens
))
```

#### Configuration Options

```python
api_client = ApiClient(ApiClientOptions(
    domain="<AUTH0_DOMAIN>",
    audience="<AUTH0_AUDIENCE>",
    dpop_enabled=True,          # Enable/disable DPoP support
    dpop_required=False,        # Require DPoP (reject Bearer)
    dpop_iat_leeway=30,         # Clock skew tolerance (seconds)
    dpop_iat_offset=300,        # Maximum proof age (seconds)
))
```

### 7. Multi-Custom Domain (MCD) Support

If your Auth0 tenant has multiple custom domains, or you're migrating between domains, the SDK can accept tokens from any of them:

#### Static Domain List

```python
from auth0_api_python import ApiClient, ApiClientOptions

api_client = ApiClient(ApiClientOptions(
    domains=[
        "tenant.auth0.com",
        "auth.example.com",
        "auth.acme.org"
    ],
    audience="https://api.example.com"
))

# Tokens from any of the three domains are accepted
claims = await api_client.verify_access_token(access_token)
```

#### Dynamic Resolver

For runtime domain resolution based on request context:

```python
from auth0_api_python import ApiClient, ApiClientOptions, DomainsResolverContext

def resolve_domains(context: DomainsResolverContext) -> list[str]:
    # Determine allowed domains based on the request
    return ["tenant.auth0.com", "auth.example.com"]

api_client = ApiClient(ApiClientOptions(
    domains=resolve_domains,
    audience="https://api.example.com"
))
```

For hybrid mode (migration scenarios), resolver patterns, error handling, and caching configuration, see the full guides:

- **[Multi-Custom Domain Guide](docs/MultipleCustomDomain.md)** - Configuration modes, resolver patterns, migration, error handling
- **[Caching Guide](docs/Caching.md)** - Cache tuning, custom adapters (Redis, Memcached)

## Feedback

### Contributing

We appreciate feedback and contribution to this repo! Before you get started, please read the following:

- [Auth0's general contribution guidelines](https://github.com/auth0/open-source-template/blob/master/GENERAL-CONTRIBUTING.md)
- [Auth0's code of conduct guidelines](https://github.com/auth0/open-source-template/blob/master/CODE-OF-CONDUCT.md)
- [This repo's contribution guide](https://github.com/auth0/auth0-api-python/CONTRIBUTING.md)

### Raise an issue

To provide feedback or report a bug, please [raise an issue on our issue tracker](https://github.com/auth0/auth0-server-python/issues).

## Vulnerability Reporting

Please do not report security vulnerabilities on the public GitHub issue tracker. The [Responsible Disclosure Program](https://auth0.com/responsible-disclosure-policy) details the procedure for disclosing security issues.

## What is Auth0?

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.auth0.com/website/sdks/logos/auth0_dark_mode.png" width="150">
    <source media="(prefers-color-scheme: light)" srcset="https://cdn.auth0.com/website/sdks/logos/auth0_light_mode.png" width="150">
    <img alt="Auth0 Logo" src="https://cdn.auth0.com/website/sdks/logos/auth0_light_mode.png" width="150">
  </picture>
</p>
<p align="center">
  Auth0 is an easy to implement, adaptable authentication and authorization platform. To learn more checkout <a href="https://auth0.com/why-auth0">Why Auth0?</a>
</p>
<p align="center">
  This project is licensed under the MIT license. See the <a href="https://github.com/auth0/auth0-api-python/LICENSE"> LICENSE</a> file for more info.
</p>
