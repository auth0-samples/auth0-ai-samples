from abc import ABC, abstractmethod
from typing import Generic, Optional, TypeVar, Sequence, TypedDict

T = TypeVar("T")

class StorePutOptions(TypedDict):
    """
    Options for storing a value in the store.

    Attributes:
        expires_in (int, optional): The time in milliseconds after which the value expires. If None, the value does not expire.
    """
    expires_in: Optional[int]

class Store(ABC, Generic[T]):
    """
    A key-value store interface.

    Auth0AI uses this store in different stages:
        - To store the authorization request when an AI agent is interrupted (Async Authorization).
        - To store user credentials associated with threads to avoid re-authentication (Async Authorization, Token Vault).
    """

    @abstractmethod
    async def get(self, namespace: Sequence[str], key: str) -> T | None:
        """
        Get a value from the store.

        Args:
            namespace (Sequence[str]): The namespace of the key.
            key (str): The key.

        Returns:
            Optional[T]: The stored value, or None if not found.
        """
        pass

    @abstractmethod
    async def delete(self, namespace: Sequence[str], key: str) -> None:
        """
        Delete a value from the store.

        Args:
            namespace (Sequence[str]): The namespace of the key.
            key (str): The key.
        """
        pass

    @abstractmethod
    async def put(
        self,
        namespace: Sequence[str],
        key: str,
        value: T,
        options: Optional[StorePutOptions] = None
    ) -> None:
        """
        Put a value in the store.

        Args:
            namespace (Sequence[str]): The namespace of the key.
            key (str): The key.
            value (T): The value to store.
            options (StorePutOptions, optional): Options for storing the value. Includes:
                - expires_in (int, optional): Time in milliseconds before the value expires. If None, it doesn't expire.
        """
        pass
