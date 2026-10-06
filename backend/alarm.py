"""Shared Vertex AI chat model factory for studio agents."""

import os

from dotenv import load_dotenv
from langchain_google_vertexai import ChatVertexAI


def get_alarm() -> ChatVertexAI:
    """Build a model from GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, VERTEX_MODEL."""
    load_dotenv()
    names = ("GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION", "VERTEX_MODEL")
    settings = {name: os.getenv(name, "").strip() for name in names}
    missing = [name for name, value in settings.items() if not value]
    if missing:
        raise ValueError(f"Missing required environment variables: {', '.join(missing)}")

    return ChatVertexAI(
        project=settings["GOOGLE_CLOUD_PROJECT"],
        location=settings["GOOGLE_CLOUD_LOCATION"],
        model=settings["VERTEX_MODEL"],
        temperature=0.2,
        max_retries=3,
    )
