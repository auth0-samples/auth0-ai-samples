from abc import ABC
from typing import Union
from auth0_ai.authorizers.async_authorization import AsyncAuthorizerBase
from auth0_ai.interrupts.async_authorization_interrupts import AuthorizationPendingInterrupt, AuthorizationPollingInterrupt
from auth0_ai_langchain.utils.interrupt import to_graph_interrupt
from auth0_ai_langchain.utils.tool_wrapper import tool_wrapper
from langchain_core.tools import BaseTool

class AsyncAuthorizer(AsyncAuthorizerBase, ABC):
    def _handle_authorization_interrupts(self, err: Union[AuthorizationPendingInterrupt, AuthorizationPollingInterrupt]) -> None:
        raise to_graph_interrupt(err)
    
    def authorizer(self):
        def wrap_tool(tool: BaseTool) -> BaseTool:
            return tool_wrapper(tool, self.protect)
        
        return wrap_tool
