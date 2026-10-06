import asyncio
from tools.email_tool import send_email


async def main():
    result = await send_email(
        to="saikiamanobraj@gmail.com",
        subject="Agent Studio Test",
        body="Courier tool is working."
    )

    print(result)


asyncio.run(main())