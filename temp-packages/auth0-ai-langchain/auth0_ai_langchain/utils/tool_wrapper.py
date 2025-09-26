from typing import Callable
from typing_extensions import Annotated
from pydantic import create_model
from langchain_core.tools import BaseTool, tool as create_tool, InjectedToolCallId
from langchain_core.runnables import RunnableConfig

def tool_wrapper(tool: BaseTool, protect_fn: Callable) -> BaseTool:

    # Workaround: extend existing args_schema to be able to get the tool_call_id value
    args_schema = create_model(
        tool.args_schema.__name__ + "Extended",
        __base__=tool.args_schema,
        **{"tool_call_id": (Annotated[str, InjectedToolCallId])}
    )

    @create_tool(
        tool.name,
        description=tool.description,
        args_schema=args_schema
    )
    async def wrapped_tool(config: RunnableConfig, tool_call_id: Annotated[str, InjectedToolCallId], **input):
        async def execute_fn(*_, **__):
            return await tool.ainvoke(input, config)

        return await protect_fn(
            lambda *_, **__: {
                "thread_id": config.get("configurable", {}).get("thread_id"),
                "tool_call_id": tool_call_id,
                "tool_name": tool.name,
            },
            execute_fn,
        )(**input)

    return wrapped_tool
