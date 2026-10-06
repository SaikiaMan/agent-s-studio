"""FastAPI entry point for Agent Studio's local MVP."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from events import add_client, remove_client
from orchestrator import run_workflow

logger = logging.getLogger(__name__)
_tasks: set[asyncio.Task] = set()


def _workflow_finished(task: asyncio.Task) -> None:
    _tasks.discard(task)
    if not task.cancelled():
        error = task.exception()
        if error is not None:
            logger.error("Agent Studio workflow failed: %s", type(error).__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        yield
    finally:
        pending = tuple(_tasks)
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    goal: str
    recipient: str


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/run")
async def run(request: RunRequest) -> dict:
    task = asyncio.create_task(run_workflow(request.goal, request.recipient))
    _tasks.add(task)
    task.add_done_callback(_workflow_finished)
    return {"status": "started"}


@app.websocket("/ws")
async def websocket_events(websocket: WebSocket) -> None:
    await websocket.accept()
    add_client(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        remove_client(websocket)
