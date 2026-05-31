from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models import User, Role, Permission
from .security import hash_password, verify_password
from app.core import NotFoundException, BadRequestException, log


class UserService:
    @staticmethod
    async def create_user(
        db: AsyncSession,
        username: str,
        email: str,
        password: str,
        full_name: Optional[str] = None,
        role_names: Optional[List[str]] = None
    ) -> User:
        result = await db.execute(select(User).where((User.username == username) | (User.email == email)))
        existing = result.scalar_one_or_none()
        if existing:
            raise BadRequestException("用户名或邮箱已存在")

        password_hash = hash_password(password)
        user = User(
            username=username,
            email=email,
            password_hash=password_hash,
            full_name=full_name
        )

        if role_names:
            roles_result = await db.execute(select(Role).where(Role.name.in_(role_names)))
            roles = roles_result.scalars().all()
            user.roles = list(roles)

        db.add(user)
        await db.commit()
        await db.refresh(user)
        log.info(f"用户创建成功: {username}")
        return user

    @staticmethod
    async def authenticate_user(db: AsyncSession, username: str, password: str) -> Optional[User]:
        result = await db.execute(
            select(User)
            .options(selectinload(User.roles).selectinload(Role.permissions))
            .where(User.username == username)
        )
        user = result.scalar_one_or_none()
        if not user or not verify_password(password, user.password_hash):
            return None
        if not user.is_active:
            raise BadRequestException("用户已被禁用")
        return user

    @staticmethod
    async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
        result = await db.execute(
            select(User)
            .options(selectinload(User.roles).selectinload(Role.permissions))
            .where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
        result = await db.execute(
            select(User)
            .options(selectinload(User.roles).selectinload(Role.permissions))
            .where(User.username == username)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_users(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        keyword: Optional[str] = None
    ) -> tuple[List[User], int]:
        query = select(User).options(selectinload(User.roles))
        if keyword:
            query = query.where(
                (User.username.contains(keyword)) |
                (User.email.contains(keyword)) |
                (User.full_name.contains(keyword))
            )
        count_result = await db.execute(select(User.id).select_from(query.subquery()))
        total = len(count_result.scalars().all())

        result = await db.execute(query.offset(skip).limit(limit).order_by(User.id.desc()))
        users = result.scalars().all()
        return users, total

    @staticmethod
    async def update_user(
        db: AsyncSession,
        user_id: int,
        **kwargs
    ) -> User:
        user = await UserService.get_user_by_id(db, user_id)
        if not user:
            raise NotFoundException("用户不存在")

        for key, value in kwargs.items():
            if key == "password" and value:
                setattr(user, "password_hash", hash_password(value))
            elif key != "password":
                setattr(user, key, value)

        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def delete_user(db: AsyncSession, user_id: int) -> bool:
        user = await UserService.get_user_by_id(db, user_id)
        if not user:
            raise NotFoundException("用户不存在")
        await db.delete(user)
        await db.commit()
        return True


class RoleService:
    @staticmethod
    async def create_role(
        db: AsyncSession,
        name: str,
        description: Optional[str] = None,
        permission_names: Optional[List[str]] = None
    ) -> Role:
        result = await db.execute(select(Role).where(Role.name == name))
        existing = result.scalar_one_or_none()
        if existing:
            raise BadRequestException("角色已存在")

        role = Role(name=name, description=description)

        if permission_names:
            perms_result = await db.execute(select(Permission).where(Permission.name.in_(permission_names)))
            permissions = perms_result.scalars().all()
            role.permissions = list(permissions)

        db.add(role)
        await db.commit()
        await db.refresh(role)
        return role

    @staticmethod
    async def get_role_by_id(db: AsyncSession, role_id: int) -> Optional[Role]:
        result = await db.execute(
            select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_roles(db: AsyncSession) -> List[Role]:
        result = await db.execute(select(Role).options(selectinload(Role.permissions)))
        return result.scalars().all()

    @staticmethod
    async def assign_roles_to_user(db: AsyncSession, user_id: int, role_ids: List[int]) -> User:
        user = await UserService.get_user_by_id(db, user_id)
        if not user:
            raise NotFoundException("用户不存在")

        roles_result = await db.execute(select(Role).where(Role.id.in_(role_ids)))
        roles = roles_result.scalars().all()
        user.roles = list(roles)

        await db.commit()
        await db.refresh(user)
        return user


class PermissionService:
    @staticmethod
    async def create_permission(
        db: AsyncSession,
        name: str,
        resource: str,
        action: str,
        description: Optional[str] = None
    ) -> Permission:
        result = await db.execute(select(Permission).where(Permission.name == name))
        existing = result.scalar_one_or_none()
        if existing:
            raise BadRequestException("权限已存在")

        perm = Permission(
            name=name,
            resource=resource,
            action=action,
            description=description
        )
        db.add(perm)
        await db.commit()
        await db.refresh(perm)
        return perm

    @staticmethod
    async def list_permissions(db: AsyncSession) -> List[Permission]:
        result = await db.execute(select(Permission))
        return result.scalars().all()

    @staticmethod
    async def init_default_permissions(db: AsyncSession):
        default_perms = [
            ("document:upload", "document", "upload", "上传文档"),
            ("document:download", "document", "download", "下载文档"),
            ("document:delete", "document", "delete", "删除文档"),
            ("document:view", "document", "view", "查看文档"),
            ("law:search", "law", "search", "检索法条"),
            ("law:manage", "law", "manage", "管理法条"),
            ("case:search", "case", "search", "检索案例"),
            ("case:compare", "case", "compare", "案例比对"),
            ("task:create", "task", "create", "创建任务"),
            ("task:view", "task", "view", "查看任务"),
            ("task:manage", "task", "manage", "管理任务"),
            ("export:download", "export", "download", "导出结果"),
            ("user:manage", "user", "manage", "用户管理"),
            ("role:manage", "role", "manage", "角色管理"),
        ]

        for name, resource, action, desc in default_perms:
            result = await db.execute(select(Permission).where(Permission.name == name))
            if not result.scalar_one_or_none():
                perm = Permission(name=name, resource=resource, action=action, description=desc)
                db.add(perm)

        default_roles = [
            ("admin", "系统管理员", [p[0] for p in default_perms]),
            ("user", "普通用户", ["document:upload", "document:view", "law:search", "case:search",
                                 "case:compare", "task:create", "task:view", "export:download"]),
            ("guest", "访客", ["law:search", "case:search"])
        ]

        for role_name, desc, perm_names in default_roles:
            result = await db.execute(select(Role).where(Role.name == role_name))
            if not result.scalar_one_or_none():
                perms_result = await db.execute(select(Permission).where(Permission.name.in_(perm_names)))
                perms = perms_result.scalars().all()
                role = Role(name=role_name, description=desc, permissions=list(perms))
                db.add(role)

        await db.commit()
        log.info("默认权限和角色初始化完成")
