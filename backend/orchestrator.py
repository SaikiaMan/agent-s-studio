"""Run the Researcher, Writer, and Courier sequentially."""

if __package__:
    from .agents.researcher import research
    from .agents.writer import write_report
    from .agents.courier import deliver
    from .events import emit
else:
    from agents.researcher import research
    from agents.writer import write_report
    from agents.courier import deliver
    from events import emit


async def run_workflow(goal: str, recipient: str) -> dict:
    """Research a goal, save its report, and deliver it by email."""
    research_result = await research(goal)
    await emit("researcher", "handoff", "Handing research to Writer.")

    report = await write_report(goal, research_result)
    await emit("writer", "handoff", "Handing the report to Courier.")

    delivery_result = await deliver(report, recipient)
    return {
        "goal": goal,
        "research": research_result,
        "report": report,
        "delivery": delivery_result,
        "status": "completed",
    }
