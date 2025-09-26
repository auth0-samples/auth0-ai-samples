from abc import ABC
from typing import Any, Type, TypeVar, get_type_hints
from auth0_ai.interrupts.auth0_interrupt import Auth0Interrupt
from auth0_ai.authorizers.async_authorization import AsyncAuthorizationRequest

class WithRequestData:
    def __init__(self, request: AsyncAuthorizationRequest):
        self._request = request

    @property
    def request(self) -> AsyncAuthorizationRequest:
        return self._request

AsyncAuthorizationInterruptType = TypeVar("T", bound="AsyncAuthorizationInterrupt")

class AsyncAuthorizationInterrupt(Auth0Interrupt, ABC):
    def __init__(self, message: str, code: str):
        super().__init__(message, code)

    @classmethod
    def is_interrupt(cls: Type[AsyncAuthorizationInterruptType], interrupt: Any) -> bool:
        return (
            interrupt
            and Auth0Interrupt.is_interrupt(interrupt)
            and isinstance(interrupt["code"], str)
            and (
                (hasattr(cls, "code") and getattr(cls, "code") == interrupt["code"])
                or
                (not hasattr(cls, "code") and interrupt["code"].startswith("ASYNC_AUTHORIZATION_"))
            )
        )

    @classmethod
    def has_request_data(cls, interrupt: Any) -> bool:
        if not cls.is_interrupt(interrupt):
            return False

        if not isinstance(interrupt, dict):
            return False

        request = interrupt.get("_request")
        if not isinstance(request, dict):
            return False

        required_keys = set(get_type_hints(AsyncAuthorizationRequest).keys())
        return required_keys <= request.keys()


class AccessDeniedInterrupt(AsyncAuthorizationInterrupt, WithRequestData):
    code: str = "ASYNC_AUTHORIZATION_ACCESS_DENIED"

    def __init__(self, message: str, request: AsyncAuthorizationRequest):
        AsyncAuthorizationInterrupt.__init__(self, message, AccessDeniedInterrupt.code)
        WithRequestData.__init__(self, request)


class UserDoesNotHavePushNotificationsInterrupt(AsyncAuthorizationInterrupt):
    code: str = "ASYNC_AUTHORIZATION_USER_DOES_NOT_HAVE_PUSH_NOTIFICATIONS"

    def __init__(self, message: str):
        super().__init__(message, UserDoesNotHavePushNotificationsInterrupt.code)


class AuthorizationRequestExpiredInterrupt(AsyncAuthorizationInterrupt, WithRequestData):
    code: str = "ASYNC_AUTHORIZATION_REQUEST_EXPIRED"

    def __init__(self, message: str, request: AsyncAuthorizationRequest):
        AsyncAuthorizationInterrupt.__init__(self, message, AuthorizationRequestExpiredInterrupt.code)
        WithRequestData.__init__(self, request)


class AuthorizationPendingInterrupt(AsyncAuthorizationInterrupt, WithRequestData):
    code: str = "ASYNC_AUTHORIZATION_PENDING"

    def __init__(self, message: str, request: AsyncAuthorizationRequest):
        AsyncAuthorizationInterrupt.__init__(self, message, AuthorizationPendingInterrupt.code)
        WithRequestData.__init__(self, request)

    def next_retry_interval(self) -> int:
        """Return the interval in seconds to wait before the next retry attempt."""
        return self.request["interval"]


class AuthorizationPollingInterrupt(AsyncAuthorizationInterrupt, WithRequestData):
    code: str = "ASYNC_AUTHORIZATION_POLLING_ERROR"

    def __init__(self, message: str, request: AsyncAuthorizationRequest, retry_after: int = None):
        Auth0Interrupt.__init__(self, message, AuthorizationPollingInterrupt.code)
        WithRequestData.__init__(self, request)
        self.retry_after = retry_after

    def next_retry_interval(self) -> int:
        """Return the interval in seconds to wait before the next retry attempt."""
        # Use the retry_after value from the HTTP header if available,
        # otherwise fall back to the original interval from the auth request
        return self.retry_after if self.retry_after is not None else self.request["interval"]


class InvalidGrantInterrupt(AsyncAuthorizationInterrupt, WithRequestData):
    code: str = "ASYNC_AUTHORIZATION_INVALID_GRANT"

    def __init__(self, message: str, request: AsyncAuthorizationRequest):
        Auth0Interrupt.__init__(self, message, InvalidGrantInterrupt.code)
        WithRequestData.__init__(self, request)
