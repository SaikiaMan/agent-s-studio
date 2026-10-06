"""Deliver the Writer's finished report by email."""

from tools.email_tool import send_email

if __package__ == "agents":
    from events import emit
else:
    from ..events import emit


async def deliver(report: str, recipient: str) -> str:
    """Email a finished report and return a simple success message."""
    try:
        await emit("courier", "spawn", "Courier started.")
        await emit("courier", "working", "Delivering the report.")
        await send_email(
            to=recipient, subject="Agent Studio Report", body=report
        )
        await emit("courier", "done", "Report delivered successfully.")
        return "Report delivered successfully."
    except Exception:
        await emit("courier", "error", "Report delivery failed.")
        raise
