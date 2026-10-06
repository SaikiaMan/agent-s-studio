"""Save writer output safely inside the backend outputs directory."""

import asyncio
from pathlib import Path

from tools.tracked import tracked


@tracked(agent="writer", tool="save_file")
async def save_file(filename: str, content: str) -> str:
    """Save UTF-8 text using a plain filename and return its absolute path."""
    if not filename or Path(filename).name != filename or any(
        char in filename for char in ("/", "\\", ":")
    ) or filename in (".", ".."):
        raise ValueError("Expected a plain filename without a directory path.")

    outputs = Path(__file__).resolve().parent.parent / "outputs"
    path = (outputs / filename).resolve()
    if not path.is_relative_to(outputs):
        raise ValueError("File must stay inside the outputs directory.")

    outputs.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(path.write_text, content, encoding="utf-8")
    return str(path)
