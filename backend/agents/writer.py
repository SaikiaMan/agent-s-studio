"""Turn Researcher notes into a saved Markdown report."""

import asyncio

from tools.files import save_file

if __package__ == "agents":
    from events import emit
    from llm import get_llm
else:
    from ..events import emit
    from ..llm import get_llm


async def write_report(goal: str, research: str) -> str:
    """Generate a report, save it as report.md, and return its text."""
    try:
        await emit("writer", "spawn", "Writer started.")
        await emit("writer", "working", "Preparing the report.")

        model = get_llm()
        messages = [
            (
                "system",
                "You are the Writer in a multi-agent workflow. Turn the Researcher's "
                "notes into a polished Markdown report addressing the original user "
                "goal. Use a clear title, logical sections, and concise factual prose. "
                "Preserve useful source references and URLs present in the research. "
                "Do not invent sources or facts. Preserve uncertainty and limitations, "
                "and do not claim live web verification. Return only the report's "
                "Markdown text without an enclosing code fence.",
            ),
            ("human", f"Original user goal:\n{goal}\n\nResearcher's notes:\n{research}"),
        ]
        if callable(getattr(model, "ainvoke", None)):
            response = await model.ainvoke(messages)
        else:
            response = await asyncio.to_thread(model.invoke, messages)

        content = response.content
        if isinstance(content, str):
            report = content
        else:
            report = "\n".join(
                block if isinstance(block, str) else block.get("text", "")
                for block in content
            )
        if not report.strip():
            raise ValueError("The LLM returned no report text.")

        await save_file("report.md", report)
        await emit("writer", "done", "Report generated and saved.")
        return report
    except Exception:
        await emit("writer", "error", "Report generation or saving failed.")
        raise
