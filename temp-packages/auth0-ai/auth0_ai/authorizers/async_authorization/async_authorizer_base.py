import asyncio
import contextvars
import hashlib
import inspect
import json
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Callable, Dict, Generic, Optional, Sequence, TypedDict, Union
from auth0 import Auth0Error
from auth0.authentication.back_channel_login import BackChannelLogin
from auth0.authentication.get_token import GetToken
from auth0_ai.credentials import TokenResponse
from auth0_ai.authorizers.async_authorization.async_authorizer_params import AsyncAuthorizerParams
from auth0_ai.authorizers.async_authorization.async_authorization_request import AsyncAuthorizationRequest
from auth0_ai.authorizers.types import Auth0ClientParams, ToolInput
from auth0_ai.interrupts.async_authorization_interrupts import AccessDeniedInterrupt, AuthorizationPendingInterrupt, AuthorizationPollingInterrupt, AuthorizationRequestExpiredInterrupt, InvalidGrantInterrupt, UserDoesNotHavePushNotificationsInterrupt
from auth0_ai.stores import SubStore, InMemoryStore
from auth0_ai.authorizers.context import ns_from_context, ContextGetter
from auth0_ai.utils import omit

class AsyncStorageValue(TypedDict):
    context: Any
    credentials: Optional[TokenResponse]
    # The namespace in the Store for the Async Auth authorization response.
    auth_request_ns: Sequence[str];

_local_storage: contextvars.ContextVar[Optional[AsyncStorageValue]] = contextvars.ContextVar("local_storage", default=None)

def _get_local_storage() -> AsyncStorageValue:
    store = _local_storage.get()
    if store is None:
        raise RuntimeError("The tool must be wrapped with the with_async_authorization function.")
    return store

def _update_local_storage(data: AsyncStorageValue) -> None:
    store = _get_local_storage()
    updated = store.copy()
    updated.update(data)
    _local_storage.set(updated)

@asynccontextmanager
async def _run_with_local_storage(data: AsyncStorageValue):
    if _local_storage.get() is not None:
        raise RuntimeError("Cannot nest tool calls that require Async Authorization.")
    token = _local_storage.set(data)
    try:
        yield
    finally:
        _local_storage.reset(token)

def get_async_authorization_credentials() -> TokenResponse | None:
    local_store = _get_local_storage()
    return local_store.get("credentials")

def _ensure_openid_scope(scopes: list[str]) -> str:
    if "openid" not in scopes:
        scopes.insert(0, "openid")
    return " ".join(scopes)

class AsyncAuthorizerBase(Generic[ToolInput]):
    def __init__(self, params: AsyncAuthorizerParams[ToolInput], auth0: Auth0ClientParams = None):
        auth0 = {
            "domain": (auth0 or {}).get("domain", os.getenv("AUTH0_DOMAIN")),
            "client_id": (auth0 or {}).get("client_id", os.getenv("AUTH0_CLIENT_ID")),
            "client_secret": (auth0 or {}).get("client_secret", os.getenv("AUTH0_CLIENT_SECRET")),
            "client_assertion_signing_key": (auth0 or {}).get("client_assertion_signing_key"),
            "client_assertion_signing_alg": (auth0 or {}).get("client_assertion_signing_alg"),
            "telemetry": (auth0 or {}).get("telemetry"),
            "timeout": (auth0 or {}).get("timeout"),
            "protocol": (auth0 or {}).get("protocol")
        }

        # Remove keys with None values
        auth0 = {k: v for k, v in auth0.items() if v is not None}

        self.back_channel_login = BackChannelLogin(**auth0)
        self.get_token = GetToken(**auth0)
        self.auth0 = auth0
        self.params = params

        # TODO: consider moving this to Auth0AI classes
        async_authorization_store = SubStore(params["store"] if "store" in params else InMemoryStore()).create_sub_store("AUTH0_AI_ASYNC_AUTHORIZATION")

        self.auth_request_store = SubStore[AsyncAuthorizationRequest](async_authorization_store, {
            "get_ttl": lambda auth_request: auth_request["expires_in"] * 1000 if "expires_in" in auth_request else None
        })

        self.credentials_store = SubStore[TokenResponse](async_authorization_store, {
            "get_ttl": lambda credential: credential["expires_in"] * 1000 if "expires_in" in credential else None
        })

    def _handle_authorization_interrupts(self, err: Union[AuthorizationPendingInterrupt, AuthorizationPollingInterrupt]) -> None:
        raise err

    def _get_instance_id(self, authorize_params) -> str:
        props = {
            "auth0": omit(self.auth0, ["client_secret", "client_assertion_signing_key"]),
            "params": authorize_params
        }
        sh = json.dumps(props, sort_keys=True, separators=(",", ":"))
        return hashlib.md5(sh.encode("utf-8")).hexdigest()

    async def _get_authorize_params(self, *args: ToolInput.args, **kwargs: ToolInput.kwargs) -> Dict[str, Any]:
        authorize_params = {
            "scope": _ensure_openid_scope(self.params.get("scopes")),
            "audience": self.params.get("audience"),
            "requested_expiry": self.params.get("requested_expiry"),
        }

        if isinstance(self.params.get("user_id"), str):
            user_id = self.params.get("user_id")
        elif inspect.iscoroutinefunction(self.params.get("user_id")):
            user_id = await self.params.get("user_id")(*args, **kwargs)
        else:
            user_id = self.params.get("user_id")(*args, **kwargs)

        if not user_id:
            raise ValueError("Unable to resolve user id, check the provided user_id parameter.")

        authorize_params["login_hint"] = f'{{ "format": "iss_sub", "iss": "https://{self.back_channel_login.domain}/", "sub": "{user_id}" }}'

        if isinstance(self.params.get("binding_message"), str):
            authorize_params["binding_message"] = self.params.get("binding_message")
        elif inspect.iscoroutinefunction(self.params.get("binding_message")):
            authorize_params["binding_message"] = await self.params.get("binding_message")(*args, **kwargs)
        else:
            authorize_params["binding_message"] = self.params.get("binding_message")(*args, **kwargs)

        if isinstance(self.params.get("authorization_details"), list):
            authorize_params["authorization_details"] = json.dumps(self.params.get("authorization_details"))
        elif inspect.iscoroutinefunction(self.params.get("authorization_details")):
            authorize_params["authorization_details"] = json.dumps(await self.params.get("authorization_details")(*args, **kwargs))
        elif callable(self.params.get("authorization_details")):
            authorize_params["authorization_details"] = json.dumps(self.params.get("authorization_details")(*args, **kwargs))

        return authorize_params

    async def _start(self, authorize_params) -> AsyncAuthorizationRequest:
        requested_at = time.time()

        try:
            response = self.back_channel_login.back_channel_login(**authorize_params)
            return AsyncAuthorizationRequest(
                id=response["auth_req_id"],
                requested_at=requested_at,
                expires_in=response["expires_in"],
                interval=response["interval"],
            )
        except Auth0Error as e:
            if e.error_code == "invalid_request":
                raise UserDoesNotHavePushNotificationsInterrupt(e.message)
            else:
                raise

    def _extract_retry_after_header(self, error: Auth0Error) -> Optional[int]:
        """
        Extract the Retry-After header value from an Auth0Error.
        
        Args:
            error: The Auth0Error object that may contain HTTP headers
            
        Returns:
            The retry-after value in seconds as an integer, or None if not present
        """

        if not hasattr(error, 'headers') or not error.headers:
            return None
            
        retry_after = error.headers.get('retry-after') or error.headers.get('Retry-After')
        
        if retry_after is None:
            return None
            
        try:
            return int(retry_after)
        except (ValueError, TypeError):
            # If the retry-after value is not a valid integer, return None
            return None

    def _get_credentials_internal(self, auth_request: AsyncAuthorizationRequest) -> TokenResponse | None:
        try:
            # Calculate elapsed time in seconds
            elapsed_seconds = datetime.now().timestamp() - auth_request["requested_at"]

            if elapsed_seconds >= auth_request["expires_in"]:
                raise AuthorizationRequestExpiredInterrupt(
                    "The authorization request has expired.",
                    auth_request
                )

            response = self.get_token.backchannel_login(auth_req_id=auth_request["id"])
            return TokenResponse(
                access_token=response["access_token"],
                expires_in=response["expires_in"],
                scope=response.get("scope", "").split(),
                token_type=response.get("token_type"),
                id_token=response.get("id_token"),
                refresh_token=response.get("refresh_token"),
            )

        except Auth0Error as e:
            if e.error_code == "authorization_pending":
                raise AuthorizationPendingInterrupt(e.message, auth_request)

            if e.error_code == "slow_down":
                retry_after = self._extract_retry_after_header(e)
                raise AuthorizationPollingInterrupt(e.message, auth_request, retry_after)

            if e.error_code == "invalid_grant":
                raise InvalidGrantInterrupt(e.message, auth_request)

            if e.error_code == "invalid_request":
                raise UserDoesNotHavePushNotificationsInterrupt(e.message)

            if e.error_code == "access_denied":
                raise AccessDeniedInterrupt(e.message, auth_request)

            raise

    def _get_credentials(self, auth_request: AsyncAuthorizationRequest) -> TokenResponse | None:
        return self._get_credentials_internal(auth_request)

    async def get_credentials_polling(self, auth_request: AsyncAuthorizationRequest) -> TokenResponse | None:
        credentials: TokenResponse | None = None

        while not credentials:
            try:
                credentials = self._get_credentials_internal(auth_request)
            except (AuthorizationPendingInterrupt, AuthorizationPollingInterrupt) as err:
                await asyncio.sleep(err.next_retry_interval())
            except Exception:
                raise

        return credentials

    async def delete_auth_request(self):
        local_store = _get_local_storage()
        auth_request_ns = local_store["auth_request_ns"]
        await self.auth_request_store.delete(auth_request_ns, "auth_request")

    def protect(
        self,
        get_context: ContextGetter[ToolInput],
        execute: Callable[ToolInput, any]
    ) -> Callable[ToolInput, any]:
        async def wrapped_execute(*args: ToolInput.args, **kwargs: ToolInput.kwargs):
            context = get_context(*args, **kwargs)
            authorize_params = await self._get_authorize_params(*args, **kwargs)
            instance_id = self._get_instance_id(authorize_params)
            auth_request_ns = [instance_id, "auth_requests", *ns_from_context("tool-call", context)]
            credentials_ns = [instance_id, "credentials", *ns_from_context(self.params.get("credentials_context", "tool-call"), context)]

            local_store = {
                "context": context,
                "auth_request_ns": auth_request_ns,
            }

            async with _run_with_local_storage(local_store):
                interrupt_mode = self.params.get("on_authorization_request", "interrupt") == "interrupt"

                try:
                    credentials = await self.credentials_store.get(credentials_ns, "credential")
                    if not credentials:
                        if interrupt_mode:
                            auth_request = await self.auth_request_store.get(auth_request_ns, "auth_request")
                            if not auth_request:
                                # initial request
                                auth_request = await self._start(authorize_params)
                                await self.auth_request_store.put(auth_request_ns, "auth_request", auth_request)

                            credentials = self._get_credentials(auth_request)
                        else:
                            # block mode
                            auth_request = await self._start(authorize_params)
                            credentials = await self.get_credentials_polling(auth_request)

                        await self.delete_auth_request()

                        if credentials is not None:
                            await self.credentials_store.put(credentials_ns, "credential", credentials)
                except (AuthorizationPendingInterrupt, AuthorizationPollingInterrupt) as interrupt:
                    return self._handle_authorization_interrupts(interrupt)
                except Exception as err:
                    await self.delete_auth_request()
                    raise

                _update_local_storage({"credentials": credentials})

                if inspect.iscoroutinefunction(execute):
                    return await execute(*args, **kwargs)
                else:
                    return execute(*args, **kwargs)

        return wrapped_execute
