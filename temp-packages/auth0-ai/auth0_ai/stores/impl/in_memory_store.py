import asyncio
import time
from typing import Dict, TypeVar, Sequence
from auth0_ai.stores.store import Store, StorePutOptions

T = TypeVar("T")

class InMemoryStore(Store[T]):
    """
    An in-memory store for dev/demo purposes.
    """
    
    def __init__(self):
        self._store: Dict[str, tuple[T, float | None]] = {}
        self._lock = asyncio.Lock()

    def _get_key(self, namespace: Sequence[str], key: str) -> str:
        return "/".join(namespace) + "/" + key

    async def get(self, namespace: Sequence[str], key: str) -> T | None:
        store_key = self._get_key(namespace, key)

        async with self._lock:
            item = self._store.get(store_key)
            if item is None:
                return None

            value, expires_at = item
            now = time.time() * 1000  # milliseconds

            if expires_at is not None and now >= expires_at:
                del self._store[store_key]
                return None

            return value

    async def delete(self, namespace: Sequence[str], key: str) -> None:
        store_key = self._get_key(namespace, key)

        async with self._lock:
            self._store.pop(store_key, None)

    async def put(
        self,
        namespace: Sequence[str],
        key: str,
        value: T,
        options: StorePutOptions | None = None
    ) -> None:
        store_key = self._get_key(namespace, key)
        expires_in = options["expires_in"] if options and options.get("expires_in") is not None else None
        expires_at = time.time() * 1000 + expires_in if expires_in is not None else None

        async with self._lock:
            self._store[store_key] = (value, expires_at)
