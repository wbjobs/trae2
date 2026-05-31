import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.config import get_settings, ensure_dirs
from app.database import init_db


async def seed():
    settings = get_settings()
    ensure_dirs()
    await init_db()

    from app.database import async_session
    from app.models import User
    from app.auth.jwt_handler import hash_password
    from sqlalchemy import select

    async with async_session() as session:
        result = await session.execute(select(User).where(User.username == "admin"))
        if not result.scalar_one_or_none():
            admin = User(
                username="admin",
                email="admin@docsemantic.ai",
                hashed_password=hash_password("admin123"),
                role="admin",
            )
            session.add(admin)
            await session.commit()
            print("Admin user created: admin / admin123")
        else:
            print("Admin user already exists")

        result = await session.execute(select(User).where(User.username == "demo"))
        if not result.scalar_one_or_none():
            demo = User(
                username="demo",
                email="demo@docsemantic.ai",
                hashed_password=hash_password("demo123"),
                role="user",
            )
            session.add(demo)
            await session.commit()
            print("Demo user created: demo / demo123")
        else:
            print("Demo user already exists")


if __name__ == "__main__":
    asyncio.run(seed())
