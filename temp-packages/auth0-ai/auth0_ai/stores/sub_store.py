from typing import Any, Callable, Generic, Optional, Sequence, TypeVar, TypedDict, Union
from auth0_ai.stores.store import Store, StorePutOptions

T = TypeVar("T")
TNew = TypeVar("TNew")

class SubStoreParams(TypedDict, total=False):
    base_namespace: Sequence[str]
    get_ttl: Callable[[T], int | None]

class SubStore(Generic[T], Store[T]):
    """
    A store that wraps a parent store, optionally prefixing namespaces and deriving TTL values from a user-defined function.
    """

    def __init__(self, parent: Store[Any], options: Optional[SubStoreParams[T]] = None):
        if parent is None:
            raise ValueError("Parent store is required")

        self._parent = parent
        self._base_namespace = options["base_namespace"] if options and "base_namespace" in options else []
        self._get_ttl = options["get_ttl"] if options and "get_ttl" in options else None

    def _full_namespace(self, namespace: Sequence[str]) -> list[str]:
        return list(self._base_namespace) + list(namespace)

    async def get(self, namespace: Sequence[str], key: str) -> T | None:
        return await self._parent.get(self._full_namespace(namespace), key)

    async def delete(self, namespace: Sequence[str], key: str) -> None:
        await self._parent.delete(self._full_namespace(namespace), key)

    async def put(
        self,
        namespace: Sequence[str],
        key: str,
        value: T,
        options: Optional[StorePutOptions] = None
    ) -> None:
        expires_in = (
            options["expires_in"] if options and "expires_in" in options else
            self._get_ttl(value) if self._get_ttl else None
        )

        put_options = {"expires_in": expires_in} if expires_in is not None else None

        await self._parent.put(
            self._full_namespace(namespace),
            key,
            value,
            put_options
        )

    def create_sub_store(
        self,
        options: Union[
            str,
            Sequence[str],
            SubStoreParams[TNew]
        ] = None
    ) -> "SubStore[TNew]":
        base_namespace: Optional[Sequence[str]] = None
        get_ttl: Optional[Callable[[TNew], int | None]] = None

        if isinstance(options, str):
            base_namespace = [options]
        elif isinstance(options, list):
            base_namespace = options
        elif isinstance(options, dict):
            base_namespace = options.get("base_namespace")
            get_ttl = options.get("get_ttl")

        return SubStore[TNew](self, {
            "base_namespace": base_namespace or [],
            "get_ttl": get_ttl
        })
