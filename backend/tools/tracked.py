"""Lifecycle tracking for asynchronous Agent Studio tools."""

from functools import wraps

if __package__ == "tools":
    from events import emit
else:
    from ..events import emit


def tracked(agent: str, tool: str):
    """Decorate an async tool with start, end, and safe error events."""

    def decorate(function):

        @wraps(function)
        async def wrapped(*args, **kwargs):

            await emit(
                agent=agent,
                type="tool_start",
                message="Tool started.",
                tool=tool,
            )

            try:
                result = await function(*args, **kwargs)

            except Exception:
                await emit(
                    agent=agent,
                    type="error",
                    message="Tool failed.",
                    tool=tool,
                )
                raise

            await emit(
                agent=agent,
                type="tool_end",
                message="Tool finished.",
                tool=tool,
            )

            return result

        return wrapped

    return decorate
