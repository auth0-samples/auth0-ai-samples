import asyncio
import functools
import inspect
import os
from typing import Any, Awaitable, Callable, TypedDict, Optional, Union
from openfga_sdk import OpenFgaClient, ConsistencyPreference, ClientConfiguration
from openfga_sdk.client import ClientCheckRequest
from openfga_sdk.credentials import Credentials, CredentialConfiguration
from auth0_ai.authorizers.types import ToolInput

class FGAAuthorizerCredentialsConfig(TypedDict, total=False):
    api_issuer: str
    api_audience: str
    client_id: str
    client_secret: str

class FGAAuthorizerCredentials(TypedDict, total=False):
    method: Any
    config: FGAAuthorizerCredentialsConfig

class FGAAuthorizerParams(TypedDict, total=False):
    api_url: str
    store_id: str
    authorization_model_id: Optional[str]
    credentials: FGAAuthorizerCredentials

class FGAAuthorizerOptions(TypedDict):
    build_query: Callable[ToolInput, Union[ClientCheckRequest, Awaitable[ClientCheckRequest]]]
    on_unauthorized: Optional[Callable[ToolInput, Any]] = None

FGAInstance = Callable[
    [FGAAuthorizerOptions],
    Callable[ToolInput, Callable[ToolInput, Any]]
]

def _merge_args_kwargs(fn: Callable, *args, **kwargs) -> dict:
    sig = inspect.signature(fn)
    bound = sig.bind(*args, **kwargs)
    bound.apply_defaults()
    return dict(bound.arguments)

class FGAAuthorizer:
    def __init__(self, params: Optional[FGAAuthorizerParams] = None):
        params = params or {}
        credentials = params.get("credentials", {})
        credentials_config = credentials.get("config", {})
        
        self.fga_configuration = ClientConfiguration(
            api_url=params.get("api_url", os.getenv("FGA_API_URL", "https://api.us1.fga.dev")),
            store_id=params.get("store_id", os.getenv("FGA_STORE_ID")),
            authorization_model_id=params.get("authorization_model_id", os.getenv("FGA_MODEL_ID")),
            credentials=Credentials(
                method=credentials.get("method", "client_credentials"),
                configuration=CredentialConfiguration(
                    api_issuer=credentials_config.get("api_issuer", os.getenv("FGA_API_TOKEN_ISSUER", "auth.fga.dev")),
                    api_audience=credentials_config.get("api_audience", os.getenv("FGA_API_AUDIENCE", "https://api.us1.fga.dev/")),
                    client_id=credentials_config.get("client_id", os.getenv("FGA_CLIENT_ID")),
                    client_secret=credentials_config.get("client_secret", os.getenv("FGA_CLIENT_SECRET")),
                )
            )
        )

    async def _authorize(self, options: FGAAuthorizerOptions, tool_context: Optional[Any] = None) -> bool:
        query = await options["build_query"](tool_context) if asyncio.iscoroutinefunction(options["build_query"]) else options["build_query"](tool_context)
        
        async with OpenFgaClient(self.fga_configuration) as fga_client:
            response = await fga_client.check(ClientCheckRequest(**query), {"consistency": ConsistencyPreference.HIGHER_CONSISTENCY})
            await fga_client.close()
            return response.allowed

    @staticmethod
    async def authorize(options: FGAAuthorizerOptions, params: Optional[FGAAuthorizerParams] = None) -> bool:
        authorizer = FGAAuthorizer(params)
        return await authorizer._authorize(options)

    @staticmethod
    def create(params: Optional[FGAAuthorizerParams] = None) -> FGAInstance:
        authorizer = FGAAuthorizer(params)

        def instance(**options: FGAAuthorizerOptions):
            def fga(
                handler: Callable[ToolInput, Any]
            ) -> Callable[ToolInput, Awaitable[Any]]:
                
                @functools.wraps(handler)
                async def wrapper(*args: ToolInput.args, **kwargs: ToolInput.kwargs) -> Any:
                    tool_context = _merge_args_kwargs(handler, *args, **kwargs)
                    is_authorized = await authorizer._authorize(options, tool_context)

                    if not is_authorized:
                        if options["on_unauthorized"]:
                            return await options["on_unauthorized"](tool_context) if asyncio.iscoroutinefunction(options["on_unauthorized"]) else options["on_unauthorized"](tool_context)
                        raise Exception("The user is not allowed to perform the action.")
                    
                    # Call tool handler
                    return await handler(*args, **kwargs) if asyncio.iscoroutinefunction(handler) else handler(*args, **kwargs)

                return wrapper
            
            return fga

        return instance
