"""Send courier messages through Gmail SMTP over SSL."""

import asyncio
import os
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path

from dotenv import load_dotenv
from tools.tracked import tracked

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@tracked(agent="courier", tool="send_email")
async def send_email(to: str, subject: str, body: str) -> str:
    """Send a text email using credentials from the root .env file."""
    load_dotenv(dotenv_path=PROJECT_ROOT / ".env")
    address = os.getenv("GMAIL_ADDRESS", "").strip()
    password = os.getenv("GMAIL_APP_PASSWORD", "").strip()
    missing = [
        name for name, value in (
            ("GMAIL_ADDRESS", address), ("GMAIL_APP_PASSWORD", password)
        ) if not value
    ]
    if missing:
        raise ValueError(f"Missing required environment variables: {', '.join(missing)}")

    message = EmailMessage()
    message["From"] = address
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    def send() -> None:
        with smtplib.SMTP_SSL(
            "smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=30
        ) as smtp:
            smtp.login(address, password)
            smtp.send_message(message)

    await asyncio.to_thread(send)
    return "Email sent successfully."
