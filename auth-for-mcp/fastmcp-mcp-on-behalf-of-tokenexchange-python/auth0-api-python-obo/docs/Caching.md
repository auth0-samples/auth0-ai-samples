# Caching

The SDK caches OIDC discovery metadata and JWKS (JSON Web Key Sets) to avoid redundant network calls on every token verification. In MCD mode, each issuer domain gets its own cache entries.

## Default Behavior

By default, the SDK uses an in-memory LRU cache with:

- **TTL**: 600 seconds (10 minutes), or the server's `Cache-Control: max-age` value - whichever is lower
- **Max entries**: 100 per cache (discovery and JWKS caches are separate)
- **Eviction**: Least Recently Used (LRU) when max entries is reached

No configuration is needed for the default cache. It works well for single-server deployments.

## Configuration

### TTL and Max Entries

```python
from auth0_api_python import ApiClient, ApiClientOptions

api_client = ApiClient(ApiClientOptions(
    domains=["tenant.auth0.com", "auth.example.com"],
    audience="https://api.example.com",
    cache_ttl_seconds=300,   # 5 minutes max TTL
    cache_max_entries=50     # 50 entries per cache
))
```

The effective TTL for each entry is `min(server_max_age, cache_ttl_seconds)`. Auth0 typically sends `Cache-Control: max-age=15` for discovery metadata, so the effective TTL will be 15 seconds even if you configure a higher value.

### Custom Cache Adapter

For distributed deployments (multiple servers, containers), use a shared cache backend by implementing `CacheAdapter`:

```python
import json
from typing import Any, Optional
from auth0_api_python import ApiClient, ApiClientOptions, CacheAdapter

class RedisCache(CacheAdapter):
    def __init__(self, redis_client):
        self.redis = redis_client

    def get(self, key: str) -> Optional[Any]:
        value = self.redis.get(key)
        return json.loads(value) if value else None

    def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
        serialized = json.dumps(value)
        if ttl_seconds:
            self.redis.set(key, serialized, ex=ttl_seconds)
        else:
            self.redis.set(key, serialized)

    def delete(self, key: str) -> None:
        self.redis.delete(key)

    def clear(self) -> None:
        # Be careful: this clears the entire Redis database
        self.redis.flushdb()

# Usage
import redis
redis_client = redis.Redis(host="localhost", port=6379, db=0)

api_client = ApiClient(ApiClientOptions(
    domains=["tenant.auth0.com", "auth.example.com"],
    audience="https://api.example.com",
    cache_adapter=RedisCache(redis_client)
))
```

When a custom adapter is provided, both the discovery cache and JWKS cache use the same adapter instance. Cache keys are inherently distinct — discovery keys are normalized issuer URLs (e.g., `https://tenant.auth0.com/`) and JWKS keys are `jwks_uri` values (e.g., `https://tenant.auth0.com/.well-known/jwks.json`).

**Note:** Because both caches share one adapter, entries share the same LRU eviction pool. A JWKS entry could evict a discovery entry (or vice versa) under memory pressure. Set `cache_max_entries` accordingly — recommended: `number_of_issuers × 2`. With the default `InMemoryCache`, discovery and JWKS caches are separate and each gets its own `max_entries` budget.

## Tuning Recommendations

### TTL

- **Development**: Use a short TTL (e.g., `cache_ttl_seconds=10`) to pick up configuration changes quickly
- **Production**: The default (600 seconds) is a reasonable upper bound. Auth0's `Cache-Control: max-age` headers will typically set a lower effective TTL

### Max Entries

Each issuer domain consumes **2 cache entries** (one for discovery metadata, one for JWKS). Size the cache based on the number of distinct issuers you expect:

- **Static list with 3 domains**: `cache_max_entries=10` is more than enough
- **Dynamic resolver with many issuers**: Set to `(expected_issuers * 2) + buffer`

When the cache is full, the least recently used entry is evicted. A cache miss triggers a network fetch on the next verification for that issuer.

**Rule of thumb:** Set `cache_max_entries` to cover the number of distinct issuers a single process is expected to use during the TTL window, with some headroom.

## CacheAdapter API

| Method | Signature | Description |
|---|---|---|
| `get` | `(key: str) -> Optional[Any]` | Return cached value or `None` if not found / expired |
| `set` | `(key: str, value: Any, ttl_seconds: Optional[int]) -> None` | Store value with optional TTL |
| `delete` | `(key: str) -> None` | Remove a single entry |
| `clear` | `() -> None` | Remove all entries |

All methods are synchronous. The `value` passed to `set` is a dictionary (parsed JSON from Auth0's OIDC and JWKS endpoints).
