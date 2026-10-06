import asyncio
from agents.researcher import research


async def main():
    result = await research(
        "Research the latest major developments in AI agents in 2026. "
        "Give concise factual notes and include sources."
    )

    print("\n===== RESEARCH RESULT =====\n")
    print(result)


asyncio.run(main())