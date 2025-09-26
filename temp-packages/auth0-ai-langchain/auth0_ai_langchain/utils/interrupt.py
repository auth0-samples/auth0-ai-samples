from typing import List
from auth0_ai.interrupts.auth0_interrupt import Auth0Interrupt
from langgraph.errors import GraphInterrupt
from langgraph.types import Interrupt
from langgraph_sdk.schema import Thread


def to_graph_interrupt(interrupt: Auth0Interrupt) -> GraphInterrupt:
    return GraphInterrupt([
        Interrupt(
            value=interrupt.to_json(),
            when="during",
            resumable=True,
            ns=[f"auth0AI:{interrupt.name}:{interrupt.code}"]
        )
    ])


def get_auth0_interrupts(thread: Thread) -> List[Interrupt]:
    result = []

    if "interrupts" not in thread:
        return result

    for interrupt_list in thread["interrupts"].values():
        for interrupt in interrupt_list:
            if Auth0Interrupt.is_interrupt(interrupt["value"]):
                result.append(interrupt)

    return result
