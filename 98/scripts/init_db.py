import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import engine, Base, AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User, Role, Permission
from loguru import logger


async def init_database():
    logger.info("Creating database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created successfully")

    async with AsyncSessionLocal() as db:
        logger.info("Creating initial permissions...")
        permissions = [
            ("document:read", "查看文档"),
            ("document:write", "上传/编辑文档"),
            ("document:delete", "删除文档"),
            ("task:submit", "提交校对任务"),
            ("task:read", "查看任务结果"),
            ("export:download", "导出结果"),
            ("admin:manage", "系统管理"),
        ]

        for name, desc in permissions:
            result = await db.execute(select(Permission).where(Permission.name == name))
            if not result.scalar_one_or_none():
                db.add(Permission(name=name, description=desc))

        await db.commit()

        logger.info("Creating initial roles...")
        roles = [
            ("user", "普通用户", ["document:read", "document:write", "task:submit", "task:read", "export:download"]),
            ("admin", "管理员", ["document:read", "document:write", "document:delete", "task:submit", "task:read", "export:download", "admin:manage"]),
        ]

        for role_name, role_desc, perm_names in roles:
            result = await db.execute(select(Role).where(Role.name == role_name))
            role = result.scalar_one_or_none()
            if not role:
                role = Role(name=role_name, description=role_desc)
                db.add(role)
                await db.flush()

            for perm_name in perm_names:
                result = await db.execute(select(Permission).where(Permission.name == perm_name))
                perm = result.scalar_one_or_none()
                if perm and perm not in role.permissions:
                    role.permissions.append(perm)

        await db.commit()

        logger.info("Creating superuser...")
        result = await db.execute(select(User).where(User.username == "admin"))
        if not result.scalar_one_or_none():
            admin_user = User(
                username="admin",
                email="admin@example.com",
                full_name="系统管理员",
                hashed_password=get_password_hash("admin123"),
                is_superuser=True,
                is_active=True,
            )
            db.add(admin_user)
            await db.commit()
            logger.info("Superuser created: admin / admin123")

    logger.info("Database initialization complete!")


if __name__ == "__main__":
    from sqlalchemy import select

    asyncio.run(init_database())
