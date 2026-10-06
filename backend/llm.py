import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI


ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT_DIR / ".env"

load_dotenv(ENV_PATH)


API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL = os.getenv("OPENROUTER_MODEL")
TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.2"))
MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "4096"))


def get_llm():
    if not API_KEY:
        raise ValueError(
            "OPENROUTER_API_KEY is missing. Add it to the root .env file."
        )

    if not MODEL:
        raise ValueError(
            "OPENROUTER_MODEL is missing. Add it to the root .env file."
        )

    return ChatOpenAI(
        model=MODEL,
        api_key=API_KEY,
        base_url="https://openrouter.ai/api/v1",
        temperature=TEMPERATURE,
        max_tokens=MAX_TOKENS,
        max_retries=3,
    )
