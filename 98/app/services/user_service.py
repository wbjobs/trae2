from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload

from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.exceptions import (
    NotFoundException,
    ConflictException,
    BadRequestException,
    UnauthorizedException,
)
from app.models.user import User, Role, Permission
from app.schemas.user import UserCreate, UserUpdate, Token
from app.core.config import get_settings

settings = get_settings()


class UserService:
    async def get_by_id(self, db: AsyncSession, user_id: int) -> Optional[User]:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_username(self, db: AsyncSession, username: str) -> Optional[User]:
        result = await db.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()

    async def get_by_email(self, db: AsyncSession, email: str) -> Optional[User]:
        result = await db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def authenticate(self, db: AsyncSession, username: str, password: str) -> Optional[User]:
        user = await self.get_by_username(db, username)
        if not user:
            user = await self.get_by_email(db, username)
        if not user or not verify_password(password, user.hashed_password):
            return None
        if not user.is_active:
            raise BadRequestException(detail="用户已被禁用")
        return user

    async def create_user(self, db: AsyncSession, user_in: UserCreate) -> User:
        if await self.get_by_username(db, user_in.username):
            raise ConflictException(detail="用户名已存在")
        if await self.get_by_email(db, user_in.email):
            raise ConflictException(detail="邮箱已被注册")

        user = User(
            username=user_in.username,
            email=user_in.email,
            full_name=user_in.full_name,
            hashed_password=get_password_hash(user_in.password),
            is_active=user_in.is_active,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    async def update_user(
        self, db: AsyncSession, user_id: int, user_in: UserUpdate
    ) -> User:
        user = await self.get_by_id(db, user_id)
        if not user:
            raise NotFoundException(detail="用户不存在")

        update_data = user_in.model_dump(exclude_unset=True)
        if "password" in update_data:
            update_data["hashed_password"] = get_password_hash(update_data.pop("password"))

        for field, value in update_data.items():
            setattr(user, field, value)

        await db.commit()
        await db.refresh(user)
        return user

    async def list_users(
        self, db: AsyncSession, page: int = 1, page_size: int = 20
    ) -> tuple[List[User], int]:
        offset = (page - 1) * page_size

        result = await db.execute(
            select(User).offset(offset).limit(page_size).order_by(User.id.desc())
        )
        users = result.scalars().all()

        count_result = await db.execute(select(func.count()).select_from(User))
        total = count_result.scalar()

        return list(users), total

    async def delete_user(self, db: AsyncSession, user_id: int) -> bool:
        user = await self.get_by_id(db, user_id)
        if not user:
            raise NotFoundException(detail="用户不存在")
        await db.delete(user)
        await db.commit()
        return True

    async def create_access_token(self, user: User) -> Token:
        access_token = create_access_token(
            subject=user.username,
            additional_claims={"user_id": user.id},
        )
        return Token(
            access_token=access_token,
            token_type="bearer",
            expires_in=settings.access_token_expire_minutes * 60,
            user=user,
        )

    async def get_user_roles(self, db: AsyncSession, user_id: int) -> List[Role]:
        result = await db.execute(
            select(User)
            .options(joinedload(User.roles).joinedload(Role.permissions))
            .where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException(detail="用户不存在")
        return list(user.roles)


user_service = UserService()
