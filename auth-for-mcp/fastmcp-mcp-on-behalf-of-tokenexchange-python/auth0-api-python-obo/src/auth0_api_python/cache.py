import time
from abc import ABC, abstractmethod
from typing import Any, Optional


class CacheAdapter(ABC):
    """
    Abstract base class for cache implementations.

    Allows custom cache backends (Redis, Memcached, etc.) to be plugged into
    the ApiClient for caching OIDC discovery metadata and JWKS.

    Example:
        class RedisCache(CacheAdapter):
            def __init__(self, redis_client):
                self.redis = redis_client

            def get(self, key: str) -> Optional[Any]:
                value = self.redis.get(key)
                return json.loads(value) if value else None

            def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
                self.redis.set(key, json.dumps(value), ex=ttl_seconds)

            def delete(self, key: str) -> None:
                self.redis.delete(key)

            def clear(self) -> None:
                self.redis.flushdb()
    """

    @abstractmethod
    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache by key.

        Args:
            key: Cache key to retrieve

        Returns:
            Cached value if found and not expired, None otherwise
        """
        pass

    @abstractmethod
    def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
        """
        Set value in cache with optional TTL.

        Args:
            key: Cache key to store
            value: Value to cache
            ttl_seconds: Time-to-live in seconds. None means no expiration.
        """
        pass

    @abstractmethod
    def delete(self, key: str) -> None:
        """
        Delete value from cache.

        Args:
            key: Cache key to delete
        """
        pass

    @abstractmethod
    def clear(self) -> None:
        """Clear all cache entries."""
        pass


class InMemoryCache(CacheAdapter):
    """
    Default in-memory cache implementation with LRU eviction.

    Designed for asyncio (single-threaded).
    For multi-threaded environments, implement a custom CacheAdapter
    with appropriate locking.

    Features:
    - TTL (time-to-live) support per entry using monotonic clock
    - LRU (Least Recently Used) eviction when max_entries reached
    - No external dependencies

    Args:
        max_entries: Maximum number of entries to cache. When exceeded,
                    least recently used entry is evicted. Default: 100.

    Example:
        cache = InMemoryCache(max_entries=50)
        cache.set("key1", {"data": "value"}, ttl_seconds=600)
        value = cache.get("key1")  # Returns {"data": "value"}
    """

    def __init__(self, max_entries: int = 100):
        """
        Initialize in-memory cache.

        Args:
            max_entries: Maximum number of cache entries (default: 100)
        """
        self._cache: dict[str, tuple[Any, Optional[float]]] = {}
        self._max_entries = max_entries

    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache by key.

        Updates access order for LRU tracking.

        Args:
            key: Cache key to retrieve

        Returns:
            Cached value if found and not expired, None otherwise
        """
        if key not in self._cache:
            return None

        value, expiry = self._cache[key]

        if expiry is not None and time.monotonic() > expiry:
            del self._cache[key]
            return None

        del self._cache[key]
        self._cache[key] = (value, expiry)

        return value

    def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
        """
        Set value in cache with optional TTL.

        If cache is at max capacity, evicts least recently used entry.

        Args:
            key: Cache key to store
            value: Value to cache
            ttl_seconds: Time-to-live in seconds. None means no expiration.
        """
        # If key exists, remove first so reinsert goes to end
        if key in self._cache:
            del self._cache[key]
        elif len(self._cache) >= self._max_entries:
            # Evict LRU: first key in dict is oldest
            oldest_key = next(iter(self._cache))
            del self._cache[oldest_key]

        expiry = None
        if ttl_seconds is not None:
            expiry = time.monotonic() + ttl_seconds

        self._cache[key] = (value, expiry)

    def delete(self, key: str) -> None:
        """
        Delete value from cache.

        Args:
            key: Cache key to delete
        """
        self._cache.pop(key, None)

    def clear(self) -> None:
        """Clear all cache entries."""
        self._cache.clear()
