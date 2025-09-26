import asyncio
from threading import Event
from typing import Callable, Optional, Dict, Any, List, TypedDict
from auth0_ai.authorizers.async_authorization import AsyncAuthorizationRequest
from auth0_ai.interrupts.async_authorization_interrupts import AsyncAuthorizationInterrupt, AuthorizationPendingInterrupt, AuthorizationPollingInterrupt
from auth0_ai_langchain.utils.interrupt import get_auth0_interrupts
from langgraph_sdk.client import LangGraphClient
from langgraph_sdk.schema import Thread, Interrupt

class WatchedThread(TypedDict):
    thread_id: str
    assistant_id: str
    interruption_id: str
    auth_request: AsyncAuthorizationRequest
    config: Dict[str, Any]
    last_run: float

class GraphResumerFilters(TypedDict):
    graph_id: str

class GraphResumer:
    def __init__(self, lang_graph: LangGraphClient, filters: Optional[GraphResumerFilters] = None):
        self.lang_graph = lang_graph
        self.filters = filters or {}
        self.map: Dict[str, WatchedThread] = {}
        self._stop_event = Event()
        self._loop_task: Optional[asyncio.Task] = None

        # Event callbacks
        self._resume_callbacks: List[Callable[[WatchedThread], None]] = []
        self._error_callbacks: List[Callable[[Exception], None]] = []

    # Public API to register event callbacks
    def on_resume(self, callback: Callable[[WatchedThread], None]) -> "GraphResumer":
        self._resume_callbacks.append(callback)
        return self

    def on_error(self, callback: Callable[[Exception], None]) -> "GraphResumer":
        self._error_callbacks.append(callback)
        return self

    def _emit_resume(self, thread: WatchedThread) -> None:
        for callback in self._resume_callbacks:
            callback(thread)

    def _emit_error(self, error: Exception) -> None:
        for callback in self._error_callbacks:
            callback(error)

    async def _get_all_interrupted_threads(self) -> List[Thread]:
        interrupted_threads: List[Thread] = []
        offset = 0

        while True:
            page = await self.lang_graph.threads.search(
                status="interrupted",
                limit=100,
                offset=offset,
                metadata={"graph_id": self.filters["graph_id"]} if "graph_id" in self.filters else None
            )

            if not page:
                break

            for t in page:
                interrupt = self._get_first_interrupt(t)
                if interrupt and AsyncAuthorizationInterrupt.is_interrupt(interrupt["value"]) and AsyncAuthorizationInterrupt.has_request_data(interrupt["value"]):
                    interrupted_threads.append(t)

            offset += len(page)
            if len(page) < 100:
                break

        return interrupted_threads

    def _get_first_interrupt(self, thread: Thread) -> Optional[Interrupt]:
        interrupts = thread["interrupts"]
        if interrupts:
            values = list(interrupts.values())
            if values and values[0]:
                return values[0][0]
        return None

    def _get_hash_map_id(self, thread: Thread) -> str:
        return f"{thread['thread_id']}:{next(iter(thread['interrupts']))}"

    async def _resume_thread(self, t: WatchedThread):
        self._emit_resume(t)

        await self.lang_graph.runs.wait(t["thread_id"], t["assistant_id"], config=t["config"])

        t["last_run"] = asyncio.get_event_loop().time() * 1000

    async def loop(self):
        all_threads = await self._get_all_interrupted_threads()

        # Remove old interrupted threads
        active_keys = {self._get_hash_map_id(t) for t in all_threads}

        for key in list(self.map.keys()):
            if key not in active_keys:
                del self.map[key]

        # Add new interrupted threads
        for thread in all_threads:
            interrupt = next(
                (i for i in get_auth0_interrupts(thread)
                 if AuthorizationPendingInterrupt.is_interrupt(i["value"])
                 or AuthorizationPollingInterrupt.is_interrupt(i["value"])),
                None
            )

            if not interrupt or not interrupt["value"].get("_request"):
                continue

            key = self._get_hash_map_id(thread)
            if key not in self.map:
                self.map[key] = {
                    "thread_id": thread["thread_id"],
                    "assistant_id": thread["metadata"].get("graph_id"),
                    "config": getattr(thread, "config", {}),
                    "interruption_id": next(iter(thread["interrupts"])),
                    "auth_request": interrupt["value"]["_request"],
                }

        threads_to_resume = [
            t for t in self.map.values()
            if "last_run" not in t or (t["last_run"] + t["auth_request"]["interval"] * 1000 < asyncio.get_event_loop().time() * 1000)
        ]

        await asyncio.gather(*[
            self._resume_thread(t) for t in threads_to_resume
        ])

    def start(self):
        if self._loop_task and not self._loop_task.done():
            return

        self._stop_event.clear()

        async def _run_loop():
            while not self._stop_event.is_set():
                try:
                    await self.loop()
                except Exception as e:
                    self._emit_error(e)
                await asyncio.sleep(5)

        self._loop_task = asyncio.create_task(_run_loop())

    def stop(self):
        self._stop_event.set()
        if self._loop_task:
            self._loop_task.cancel()
