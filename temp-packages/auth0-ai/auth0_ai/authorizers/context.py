from typing import Callable, Literal, TypedDict
from auth0_ai.authorizers.types import ToolInput

class ToolCallContext(TypedDict):
    thread_id: str
    tool_call_id: str
    tool_name: str

AuthContext = Literal["tool-call", "tool", "thread", "agent"]

ContextGetter = Callable[ToolInput, ToolCallContext]

def ns_from_context(auth_context: AuthContext, call_context: ToolCallContext) -> list[str]:
    """
    Resolve a namespace based on the credential-sharing scope (auth_context).

    Args:
        auth_context (AuthContext): The context in which credentials are scoped.
        call_context (ToolCallContext): Information about the current tool call.

    Returns:
        list[str]: A list of namespace components.
    """
    thread_ns = ["threads", call_context["thread_id"]]
    tool_ns = ["tools", call_context["tool_name"]]
    tool_call_ns = ["tool_calls", call_context["tool_call_id"]]

    match auth_context:
        case "tool-call":
            return thread_ns + tool_ns + tool_call_ns
        case "tool":
            return thread_ns + tool_ns
        case "thread":
            return thread_ns
        case "agent":
            return []
