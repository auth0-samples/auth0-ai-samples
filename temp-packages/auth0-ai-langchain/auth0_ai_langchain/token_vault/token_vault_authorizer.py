import copy
from abc import ABC
from auth0_ai.authorizers.token_vault_authorizer import TokenVaultAuthorizerBase, \
    TokenVaultAuthorizerParams
from auth0_ai.authorizers.types import Auth0ClientParams
from auth0_ai.interrupts.token_vault_interrupt import TokenVaultInterrupt
from auth0_ai_langchain.utils.interrupt import to_graph_interrupt
from auth0_ai_langchain.utils.tool_wrapper import tool_wrapper
from langchain_core.tools import BaseTool
from langchain_core.runnables import ensure_config


async def default_get_refresh_token(*_, **__) -> str | None:
    return ensure_config().get("configurable", {}).get("_credentials", {}).get("refresh_token")

class TokenVaultAuthorizer(TokenVaultAuthorizerBase, ABC):
    def __init__(
        self,
        params: TokenVaultAuthorizerParams,
        auth0: Auth0ClientParams = None,
    ):
        missing_refresh = params.refresh_token.value is None
        missing_access_token = params.access_token.value is None

        if missing_refresh and missing_access_token and callable(default_get_refresh_token):
            params = copy.copy(params)
            params.refresh_token.value = default_get_refresh_token

        super().__init__(params, auth0)

    def _handle_authorization_interrupts(self, err: TokenVaultInterrupt) -> None:
        raise to_graph_interrupt(err)

    def authorizer(self):
        def wrap_tool(tool: BaseTool) -> BaseTool:
            return tool_wrapper(tool, self.protect)

        return wrap_tool
