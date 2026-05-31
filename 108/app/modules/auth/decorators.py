from typing import Optional, List
from functools import wraps
from sanic import Request
from sqlalchemy.orm import selectinload
from sqlalchemy import select
from app.core import UnauthorizedException, ForbiddenException, get_db
from app.models import User, Role
from .security import decode_access_token


async def get_current_user(request: Request) -> User:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise UnauthorizedException("缺少认证令牌")

    token = auth_header.split(" ")[1]
    payload = decode_access_token(token)

    user_id = int(payload.get("sub", "0"))
    if not user_id:
        raise UnauthorizedException("无效的令牌数据")

    async with get_db() as db:
        result = await db.execute(
            select(User)
            .options(selectinload(User.roles).selectinload(Role.permissions))
            .where(User.id == user_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            raise UnauthorizedException("用户不存在")
        if not user.is_active:
            raise UnauthorizedException("用户已被禁用")

        return user


def login_required():
    def decorator(handler):
        @wraps(handler)
        async def wrapper(request: Request, *args, **kwargs):
            user = await get_current_user(request)
            request.ctx.user = user
            return await handler(request, *args, **kwargs)
        return wrapper
    return decorator


def role_required(*roles: str):
    def decorator(handler):
        @wraps(handler)
        async def wrapper(request: Request, *args, **kwargs):
            user = await get_current_user(request)
            request.ctx.user = user

            if user.is_superuser:
                return await handler(request, *args, **kwargs)

            has_role = any(user.has_role(role) for role in roles)
            if not has_role:
                raise ForbiddenException(f"需要以下角色之一: {', '.join(roles)}")

            return await handler(request, *args, **kwargs)
        return wrapper
    return decorator


def permission_required(*permissions: str):
    def decorator(handler):
        @wraps(handler)
        async def wrapper(request: Request, *args, **kwargs):
            user = await get_current_user(request)
            request.ctx.user = user

            if user.is_superuser:
                return await handler(request, *args, **kwargs)

            has_perm = any(user.has_permission(perm) for perm in permissions)
            if not has_perm:
                raise ForbiddenException(f"需要以下权限之一: {', '.join(permissions)}")

            return await handler(request, *args, **kwargs)
        return wrapper
    return decorator


def superuser_required():
    def decorator(handler):
        @wraps(handler)
        async def wrapper(request: Request, *args, **kwargs):
            user = await get_current_user(request)
            request.ctx.user = user

            if not user.is_superuser:
                raise ForbiddenException("需要超级管理员权限")

            return await handler(request, *args, **kwargs)
        return wrapper
    return decorator
