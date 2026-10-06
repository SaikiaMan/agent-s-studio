"""Produce research notes for the Writer using Agent Studio's shared LLM."""

import asyncio

if __package__ == "agents":
    from events import emit
    from llm import get_llm
else:
    from ..events import emit
    from ..llm import get_llm


async def research(goal: str) -> str:
    """Return concise research notes for the Writer agent."""
    try:
        await emit("researcher", "spawn", "Researcher started.")
        await emit("researcher", "working", "Researching the supplied goal.")

        model = get_llm()
        messages = [
            (
                "system",
                "You are the Researcher in a multi-agent workflow. Given the user's "
                "goal, produce structured, factual, concise research notes to hand "
                "to a Writer agent. Organize the notes into key findings, relevant "
                "context, and uncertainties or facts needing verification. Use your "
                "available knowledge; no live web search is available. Do not claim "
                "you searched the web or verified current information. Flag "
                "time-sensitive facts and do not invent sources or citations.",
            ),
            ("human", goal),
        ]
        await emit(
            "researcher", "tool_start", "Generating research notes.", tool="research"
        )
        if callable(getattr(model, "ainvoke", None)):
            response = await model.ainvoke(messages)
        else:
            response = await asyncio.to_thread(model.invoke, messages)
        await emit(
            "researcher", "tool_end", "Research notes generated.", tool="research"
        )

        content = response.content
        if isinstance(content, str):
            notes = content
        else:
            notes = "\n".join(
                block if isinstance(block, str) else block.get("text", "")
                for block in content
            )
        if not notes.strip():
            raise ValueError("The LLM returned no research notes.")

        await emit("researcher", "done", "Research complete.")
        return notes
    except Exception:
        await emit("researcher", "error", "Research failed.")
        raise
