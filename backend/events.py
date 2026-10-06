"""Small async event broadcaster shared by Agent Studio agents."""

from __future__ import annotations

import asyncio
import json
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from starlette.websockets import WebSocket

EventType = Literal[
    "spawn", "working", "tool_start", "tool_end", "handoff", "done", "error"
]
EVENT_TYPES = frozenset(
    ("spawn", "working", "tool_start", "tool_end", "handoff", "done", "error")
)
_clients: set[WebSocket] = set()


def add_client(client: WebSocket) -> None:
    """Register an already accepted WebSocket connection."""
    _clients.add(client)


def remove_client(client: WebSocket) -> None:
    """Unregister a connection; safe to call more than once."""
    _clients.discard(client)


async def _send(client: WebSocket, payload: str) -> None:
    try:
        await client.send_text(payload)
    except Exception:
        remove_client(client)


async def emit(
    agent: str,
    type: EventType,
    message: str | list[str],
    tool: str | None = None,
) -> dict:
    """Print and broadcast an event to all currently registered clients."""
    if type not in EVENT_TYPES:
        raise ValueError(f"Unsupported event type: {type}")
    event = {"type": type, "agent": agent, "message": message}
    if tool is not None and type in ("tool_start", "tool_end"):
        event["tool"] = tool
    payload = json.dumps(event, ensure_ascii=False)
    print(payload, flush=True)
    await asyncio.gather(*(_send(client, payload) for client in tuple(_clients)))
    return event
