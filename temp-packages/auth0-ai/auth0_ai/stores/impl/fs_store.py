import asyncio
import json
import time
from pathlib import Path
from typing import Any, Dict, Generic, Optional, Sequence, TypeVar

T = TypeVar("T")

class FSStore(Generic[T]):
    """
    A file-backed key-value store with TTL support and debounced persistence.
    Use for dev/demo purposes only.
    """

    def __init__(self, filepath: str, debounce_ms: int = 100):
        """
        Initialize the FSStore.

        Args:
            filepath (str): Path to the backing JSON file.
            debounce_ms (int): Milliseconds to debounce writes. Defaults to 100ms.
        """
        self._filepath = Path(filepath).resolve()
        self._store: Dict[str, tuple[T, Optional[float]]] = {}
        self._lock = asyncio.Lock()
        self._persist_task: Optional[asyncio.TimerHandle] = None
        self._loop = asyncio.get_running_loop()
        self._debounce_delay = debounce_ms / 1000  # seconds
        self._load_task = asyncio.create_task(self._load())

    def _make_key(self, namespace: Sequence[str], key: str) -> str:
        return "/".join(namespace) + "/" + key

    async def _load(self) -> None:
        try:
            if not self._filepath.exists():
                return

            def _read():
                return self._filepath.read_text(encoding="utf-8")

            raw = await asyncio.to_thread(_read)
            data = json.loads(raw)
            now = time.time() * 1000

            for k, entry in data.items():
                value = entry["value"]
                expires_at = entry.get("expiresAt")
                if expires_at is None or expires_at > now:
                    self._store[k] = (value, expires_at)
        except Exception as e:
            print(f"[FSStore] Failed to load: {e}")

    async def get(self, namespace: Sequence[str], key: str) -> T | None:
        await self._load_task
        full_key = self._make_key(namespace, key)

        async with self._lock:
            entry = self._store.get(full_key)
            if not entry:
                return None

            value, expires_at = entry
            now = time.time() * 1000

            if expires_at is not None and now >= expires_at:
                del self._store[full_key]
                self._debounced_persist()
                return None

            return value

    async def delete(self, namespace: Sequence[str], key: str) -> None:
        await self._load_task
        full_key = self._make_key(namespace, key)

        async with self._lock:
            if full_key in self._store:
                del self._store[full_key]
                self._debounced_persist()

    async def put(
        self,
        namespace: Sequence[str],
        key: str,
        value: T,
        options: Optional[Dict[str, Any]] = None
    ) -> None:
        await self._load_task
        full_key = self._make_key(namespace, key)
        expires_in = options.get("expires_in") if options else None
        expires_at = time.time() * 1000 + expires_in if expires_in is not None else None

        async with self._lock:
            self._store[full_key] = (value, expires_at)
            self._debounced_persist()

    def _debounced_persist(self) -> None:
        if self._persist_task:
            self._persist_task.cancel()

        self._persist_task = self._loop.call_later(
            self._debounce_delay, lambda: asyncio.create_task(self._persist())
        )

    async def _persist(self) -> None:
        async with self._lock:
            data: Dict[str, Dict[str, Any]] = {}
            now = time.time() * 1000

            for k, (value, expires_at) in self._store.items():
                if expires_at is None or expires_at > now:
                    data[k] = {
                        "value": value,
                        "expiresAt": expires_at
                    }

            def _write():
                self._filepath.parent.mkdir(parents=True, exist_ok=True)
                self._filepath.write_text(json.dumps(data, indent=2), encoding="utf-8")

            try:
                await asyncio.to_thread(_write)
            except Exception as e:
                print(f"[FSStore] Failed to persist: {e}")
