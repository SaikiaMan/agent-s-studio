"""Temporary test: print one Agent Studio WebSocket event and exit."""

import asyncio
import json

from websockets.asyncio.client import connect


async def main() -> None:
    async with connect("ws://127.0.0.1:8000/ws") as websocket:
        event = json.loads(await websocket.recv())
        print(json.dumps(event, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
