from typing import Awaitable, Callable, Generic, Literal, Optional, TypedDict, Union
from auth0_ai.authorizers.context import AuthContext
from auth0_ai.authorizers.types import ToolInput
from auth0_ai.stores import Store


class AsyncAuthorizerParams(TypedDict, Generic[ToolInput]):
    """
    Authorize Options to start Async Authorization flow.

    Attributes:
        scopes (list[str]): The scopes to request authorization for.
        binding_message (Union[str, Callable[..., str], Callable[..., Awaitable[str]]]): A human-readable string to display to the user, or a function that resolves it.
        user_id (Union[str, Callable[..., str], Callable[..., Awaitable[str]]]): The user id string, or a function that resolves it.
        authorization_details (Union[list[dict], Callable[..., list[dict]], Callable[..., Awaitable[list[dict]]]], optional):The authorization requirements list (e.g., [{ type: "custom_type", param: "example", ...}]), or a function that resolves it. More info: https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-initiated-backchannel-authentication-flow/user-authorization-with-ciba
        store (Store, optional): An store used to temporarly store the authorization response data while the user is completing the authorization in another device (default: InMemoryStore).
        audience (str, optional): The audience to request authorization for.
        requested_expiry (int, optional): The time in seconds for the authorization request to expire, pass a number between 1 and 3600 (default: 300 seconds = 5 minutes).
        on_authorization_request (string, optional): The behavior when the authorization request is made. Expected values:
            - "interrupt" (default): The tool execution is interrupted until the user completes the authorization.
            - "block": The tool execution is blocked until the user completes the authorization. This mode is only useful for development purposes and should not be used in production.
        credentials_context (AuthContext, optional): Defines the scope of credential sharing:
            - "tool-call" (default): Credentials are valid only for a single invocation of the tool.
            - "agent": Credentials are shared globally across all threads and tools in the agent.
            - "thread": Credentials are shared across all tools using the same authorizer within the current thread.
            - "tool": Credentials are shared across multiple calls to the same tool within the same thread.
    """
    scopes: list[str]
    binding_message: Union[
        str,
        Callable[ToolInput, str],
        Callable[ToolInput, Awaitable[str]]
    ]
    user_id: Union[
        str,
        Callable[ToolInput, str],
        Callable[ToolInput, Awaitable[str]]
    ]
    authorization_details: Optional[Union[
        list[dict],
        Callable[ToolInput, list[dict]],
        Callable[ToolInput, Awaitable[list[dict]]]
    ]]
    store: Optional[Store]
    audience: Optional[str]
    requested_expiry: Optional[int]
    on_authorization_request: Optional[Literal["block", "interrupt"]]
    credentials_context: Optional[AuthContext]
