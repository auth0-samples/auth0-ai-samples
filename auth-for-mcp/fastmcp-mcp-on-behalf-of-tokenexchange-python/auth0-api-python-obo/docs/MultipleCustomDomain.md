# Multiple Custom Domains (MCD)

Multiple Custom Domains (MCD) support enables a single API application to accept access tokens issued by multiple domains associated with the same Auth0 tenant, including the canonical domain and its custom domains. This is commonly required in scenarios such as:

- Multi-brand applications (B2C) where each brand uses a different custom domain but they all share the same API
- A single API serves multiple frontend applications that use different custom domains
- A gradual migration from the canonical domain to a custom domain, where both domains need to be supported during the transition period

In these cases, your API must trust and validate tokens from multiple issuers instead of a single domain. The SDK supports two approaches for configuring multiple allowed issuer domains:

## Configuration Modes

### Static Domain List

For APIs that accept tokens from a known set of domains:

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

The SDK validates the token's issuer against the configured list before performing OIDC discovery. Each domain gets its own cached discovery metadata and JWKS.

### Dynamic Resolver

Use a dynamic resolver when the set of allowed issuer domains needs to be determined at runtime based on the incoming request. The SDK provides a `DomainsResolverContext` containing request and token-derived information (`request_url`, `request_headers`, and `unverified_iss`). You can use any combination of these inputs to determine the allowed issuer domains for the request.

```python
from auth0_api_python import ApiClient, ApiClientOptions, DomainsResolverContext

def resolve_domains(context: DomainsResolverContext) -> list[str]:
    # context contains:
    #   unverified_iss  - the token's issuer claim (before verification)
    #   request_url     - the URL the request was made to (if provided)
    #   request_headers - the request headers dict (if provided)
    return ["tenant.auth0.com", "auth.example.com"]

api_client = ApiClient(ApiClientOptions(
    domains=resolve_domains,
    audience="https://api.example.com"
))

claims = await api_client.verify_access_token(access_token)
```

The resolver is called on every token verification. It receives a `DomainsResolverContext` with the unverified issuer and (if available) the request URL and headers. It must return a non-empty list of allowed domain strings.

> [!NOTE]
> `request_url` is optional for bearer token verification. When provided, the SDK passes it to the resolver as `context["request_url"]`. If omitted, `context["request_url"]` will be `None`. If your resolver needs the request URL, make sure you pass `http_url` to `verify_request()`.

### Hybrid Mode (domain + domains)

For migration scenarios where you need `domain` for client-initiated flows (token exchange, connection tokens) and `domains` for token verification:

```python
api_client = ApiClient(ApiClientOptions(
    domain="tenant.auth0.com",         # Used for token exchange discovery
    domains=[                           # Used for token verification
        "tenant.auth0.com",
        "auth.newdomain.com"
    ],
    audience="https://api.example.com",
    client_id="<CLIENT_ID>",
    client_secret="<CLIENT_SECRET>"
))

# Token verification uses the domains list
claims = await api_client.verify_access_token(access_token)

# Token exchange uses the domain parameter for discovery
result = await api_client.get_token_by_exchange_profile(
    subject_token=access_token,
    subject_token_type="urn:example:subject-token"
)
```

---

## Resolver Patterns

### Host-Header Based

Route allowed domains based on the incoming request's host:

```python
def host_based_resolver(context: DomainsResolverContext) -> list[str]:
    host = (context.get("request_headers") or {}).get("host", "")

    domain_map = {
        "api.us.example.com": ["us-tenant.auth0.com", "auth.us.example.com"],
        "api.eu.example.com": ["eu-tenant.auth0.com", "auth.eu.example.com"],
    }
    return domain_map.get(host, ["default-tenant.auth0.com"])

api_client = ApiClient(ApiClientOptions(
    domains=host_based_resolver,
    audience="https://api.example.com"
))

# Pass request context through verify_request
claims = await api_client.verify_request(
    headers=request.headers,
    http_url=str(request.url)
)
```

### Tenant Lookup

Resolve domains from a database or configuration service:

```python
def tenant_resolver(context: DomainsResolverContext) -> list[str]:
    # Look up allowed domains from your tenant registry
    # The unverified_iss tells you which issuer the token claims to be from
    issuer = context["unverified_iss"]

    # Your lookup logic here (database, config file, etc.)
    allowed = get_domains_for_issuer(issuer)
    return allowed
```

> [!NOTE]
> The resolver can be synchronous or asynchronous. If your resolver is an `async def`, the SDK will automatically `await` the result.
>
> ```python
> async def async_resolver(context: DomainsResolverContext) -> list[str]:
>     domains = await fetch_domains_from_db(context["unverified_iss"])
>     return domains
> ```

---

## Security Requirements

When configuring `domains` or a domain resolver for Multiple Custom Domains, you are responsible for ensuring that only trusted issuer domains are returned. Mis-configuring the domain resolver is a critical security risk. It can cause the SDK to:

- Accept access tokens from unintended issuers
- Make discovery or JWKS requests to unintended domains

**Single Tenant Limitation:** The `domains` configuration is intended only for multiple custom domains that belong to the same Auth0 tenant. It is not a supported mechanism for connecting multiple Auth0 tenants to a single API.

**Request-Derived Input Warning:** If your resolver uses request-derived values such as `context["request_url"]`, `context["request_headers"]`, or `context["unverified_iss"]`, do not trust those values directly. Use them only to map known and expected request values to a fixed allowlist of issuer domains that you control.

In particular:

- `context["request_url"]` and `context["request_headers"]` may be influenced by clients, proxies, or load balancers, depending on your framework and deployment setup
- `context["unverified_iss"]` comes from the token before signature verification and must not be trusted by itself

If your deployment relies on reverse proxies or load balancers, ensure that host-related request information is treated as trusted only when it comes from trusted infrastructure. Misconfigured proxy handling can cause the SDK to trust unintended issuer domains.

---

## MCD with DPoP

MCD works with DPoP authentication. When using `verify_request()`, the SDK handles both MCD domain validation and DPoP proof verification:

```python
api_client = ApiClient(ApiClientOptions(
    domains=["tenant.auth0.com", "auth.example.com"],
    audience="https://api.example.com",
    dpop_required=True
))

claims = await api_client.verify_request(
    headers={
        "authorization": "DPoP eyJ0eXAiOiJKV1Q...",
        "dpop": "eyJ0eXAiOiJkcG9wK2p3dC..."
    },
    http_method="GET",
    http_url="https://api.example.com/resource"
)
```

The verification order is: extract issuer from token -> validate issuer against allowed domains -> perform OIDC discovery from the token's issuer -> verify token signature -> verify DPoP proof.

---

## Error Handling

### Configuration Errors

Raised at initialization when the SDK configuration is invalid:

```python
from auth0_api_python import ApiClient, ApiClientOptions, ConfigurationError

# Neither domain nor domains provided
try:
    api_client = ApiClient(ApiClientOptions(audience="https://api.example.com"))
except ConfigurationError as e:
    print(e)  # "Must provide either 'domain' or 'domains' parameter..."

# Empty domains list
try:
    api_client = ApiClient(ApiClientOptions(domains=[], audience="https://api.example.com"))
except ConfigurationError as e:
    print(e)  # "domains list cannot be empty"

# Invalid domains type
try:
    api_client = ApiClient(ApiClientOptions(domains="not-a-list", audience="https://api.example.com"))
except ConfigurationError as e:
    print(e)  # "domains must be either a list of domain strings or a callable..."
```

### Resolver Errors

Raised when the dynamic resolver function fails:

```python
from auth0_api_python import DomainsResolverError
from auth0_api_python.errors import VerifyAccessTokenError

# Resolver raises an exception
try:
    claims = await api_client.verify_access_token(token)
except DomainsResolverError as e:
    print(e)           # "Domains resolver function failed: <original error>"
    e.get_status_code() # 500
    e.get_error_code()  # "domains_resolver_error"

# Resolver returns invalid type or empty list
except DomainsResolverError as e:
    print(e)  # "Domains resolver must return a list" or "Domains resolver returned an empty list"
```

### Issuer Rejection

Raised when a token's issuer is not in the allowed domains:

```python
try:
    claims = await api_client.verify_access_token(token)
except VerifyAccessTokenError as e:
    print(e)           # "Token issuer is not in the list of allowed domains"
    e.get_status_code() # 401
    e.get_error_code()  # "invalid_token"
    e.get_headers()     # {"WWW-Authenticate": "Bearer error=\"invalid_token\", ..."}
```

---

## Migration Guide

### Single Domain to MCD

Migrate from a single Auth0 domain to multiple custom domains with zero downtime:

```python
# Phase 1: Start with single domain (current state)
client = ApiClient(ApiClientOptions(
    domain="tenant.auth0.com",
    audience="https://api.example.com"
))

# Phase 2: Add new domain alongside existing (during migration)
# Tokens from both domains are now accepted
client = ApiClient(ApiClientOptions(
    domain="tenant.auth0.com",
    domains=["tenant.auth0.com", "auth.newdomain.com"],
    audience="https://api.example.com"
))

# Phase 3: Full MCD with all domains (after migration)
client = ApiClient(ApiClientOptions(
    domain="tenant.auth0.com",
    domains=["tenant.auth0.com", "auth.newdomain.com", "auth.other.com"],
    audience="https://api.example.com"
))
```

### Rollback from MCD

To revert to single domain, remove the `domains` parameter:

```python
# Rollback: only the configured domain's tokens are accepted
client = ApiClient(ApiClientOptions(
    domain="tenant.auth0.com",
    audience="https://api.example.com"
))
```

---

## Configuration Reference

| Parameter | Type | Default | Description |
|---|---|---|---|
| `domain` | `str` | `None` | Single Auth0 domain. Used for client-initiated flows (token exchange, connection tokens) and single-domain verification. |
| `domains` | `list[str]` or `callable` | `None` | List of allowed domains or a resolver function. Used for token verification in MCD mode. |
| `cache_ttl_seconds` | `int` | `600` | Maximum TTL for cached discovery metadata and JWKS (seconds). The effective TTL is `min(server_max_age, cache_ttl_seconds)`. |
| `cache_max_entries` | `int` | `100` | Maximum entries per cache before LRU eviction. Each issuer uses one discovery entry and one JWKS entry. |
| `cache_adapter` | `CacheAdapter` | `None` | Custom cache backend. See [Caching Guide](Caching.md) for details. |

At least one of `domain` or `domains` must be provided. When both are provided, `domains` is used for token verification and `domain` is used for client-initiated flows.

### Domain Normalization

Domains are normalized automatically. All of these are equivalent:

- `"tenant.auth0.com"`
- `"TENANT.AUTH0.COM"`
- `"https://tenant.auth0.com"`
- `"https://tenant.auth0.com/"`
- `"  tenant.auth0.com  "`
