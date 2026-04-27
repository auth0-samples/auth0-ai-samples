import time

from auth0_api_python.cache import InMemoryCache

# ===== InMemoryCache Basic Operations =====


def test_in_memory_cache_get_set():
    """Test basic get and set operations."""
    cache = InMemoryCache()

    cache.set("key1", {"data": "value1"})
    cache.set("key2", "string_value")
    cache.set("key3", 123)

    assert cache.get("key1") == {"data": "value1"}
    assert cache.get("key2") == "string_value"
    assert cache.get("key3") == 123


def test_in_memory_cache_ttl_expiry():
    """Test that entries expire after TTL."""
    cache = InMemoryCache()

    cache.set("key1", "value1", ttl_seconds=1)

    assert cache.get("key1") == "value1"

    time.sleep(1.1)

    assert cache.get("key1") is None


def test_in_memory_cache_delete():
    """Test delete operation."""
    cache = InMemoryCache()

    cache.set("key1", "value1")
    assert cache.get("key1") == "value1"

    cache.delete("key1")
    assert cache.get("key1") is None

    cache.delete("nonexistent")


def test_in_memory_cache_clear():
    """Test clear all operation."""
    cache = InMemoryCache()

    cache.set("key1", "value1")
    cache.set("key2", "value2")
    cache.set("key3", "value3")

    assert cache.get("key1") == "value1"
    assert cache.get("key2") == "value2"

    cache.clear()

    assert cache.get("key1") is None
    assert cache.get("key2") is None
    assert cache.get("key3") is None


def test_in_memory_cache_get_expired():
    """Test that expired entries return None and are removed."""
    cache = InMemoryCache()

    cache.set("key1", "value1", ttl_seconds=1)
    time.sleep(1.1)

    result = cache.get("key1")
    assert result is None

    result_again = cache.get("key1")
    assert result_again is None


def test_in_memory_cache_get_nonexistent():
    """Test that nonexistent keys return None."""
    cache = InMemoryCache()

    assert cache.get("nonexistent") is None
    assert cache.get("another_missing_key") is None


def test_in_memory_cache_overwrite():
    """Test overwriting existing keys."""
    cache = InMemoryCache()

    cache.set("key1", "original_value")
    assert cache.get("key1") == "original_value"

    cache.set("key1", "new_value")
    assert cache.get("key1") == "new_value"

    cache.set("key1", {"complex": "value"}, ttl_seconds=10)
    assert cache.get("key1") == {"complex": "value"}


def test_in_memory_cache_no_ttl():
    """Test that entries without TTL never expire."""
    cache = InMemoryCache()

    cache.set("key1", "value1")

    time.sleep(0.5)
    assert cache.get("key1") == "value1"

    time.sleep(0.5)
    assert cache.get("key1") == "value1"


def test_in_memory_cache_ttl_zero_expires_immediately():
    """Test that ttl_seconds=0 means entries expire immediately (always refetch)."""
    cache = InMemoryCache()

    cache.set("key1", "value1", ttl_seconds=0)

    # Entry should be immediately expired — forces refetch on next access
    assert cache.get("key1") is None


# ===== LRU Eviction =====


def test_in_memory_cache_max_entries_eviction():
    """Test LRU eviction when max_entries is reached."""
    cache = InMemoryCache(max_entries=3)

    cache.set("key1", "value1")
    cache.set("key2", "value2")
    cache.set("key3", "value3")

    assert cache.get("key1") == "value1"
    assert cache.get("key2") == "value2"
    assert cache.get("key3") == "value3"

    cache.set("key4", "value4")

    assert cache.get("key1") is None
    assert cache.get("key2") == "value2"
    assert cache.get("key3") == "value3"
    assert cache.get("key4") == "value4"


def test_in_memory_cache_lru_access_order():
    """Test that least recently used entry is evicted first."""
    cache = InMemoryCache(max_entries=3)

    cache.set("key1", "value1")
    cache.set("key2", "value2")
    cache.set("key3", "value3")

    cache.get("key1")

    time.sleep(0.01)

    cache.get("key2")

    time.sleep(0.01)

    cache.set("key4", "value4")

    assert cache.get("key3") is None
    assert cache.get("key1") == "value1"
    assert cache.get("key2") == "value2"
    assert cache.get("key4") == "value4"




