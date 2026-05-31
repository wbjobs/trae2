from sanic import Blueprint, Request
from sanic.response import file
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from app.core import success, paginated_response, BadRequestException, get_db
from app.modules.auth import (
    UserService,
    RoleService,
    PermissionService,
    create_tokens,
    login_required,
    role_required,
    permission_required,
    superuser_required
)

auth_bp = Blueprint("auth", url_prefix="/api/auth")


class LoginRequest(BaseModel):
    username: str = Field(..., description="用户名")
    password: str = Field(..., description="密码")


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    email: EmailStr = Field(..., description="邮箱")
    password: str = Field(..., min_length=6, max_length=100, description="密码")
    full_name: Optional[str] = Field(None, max_length=100, description="真实姓名")


class UserUpdateRequest(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


class RoleCreateRequest(BaseModel):
    name: str = Field(..., description="角色名称")
    description: Optional[str] = None
    permission_names: Optional[List[str]] = None


class AssignRoleRequest(BaseModel):
    user_id: int = Field(..., description="用户ID")
    role_ids: List[int] = Field(..., description="角色ID列表")


@auth_bp.post("/login")
async def login(request: Request):
    req = LoginRequest(**request.json)
    async with get_db() as db:
        user = await UserService.authenticate_user(db, req.username, req.password)
        if not user:
            raise BadRequestException("用户名或密码错误")

        tokens = create_tokens(user.id, user.username)
        return success({
            **tokens,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "is_superuser": user.is_superuser,
                "roles": [{"id": r.id, "name": r.name} for r in user.roles]
            }
        }, "登录成功")


@auth_bp.post("/register")
async def register(request: Request):
    req = RegisterRequest(**request.json)
    async with get_db() as db:
        user = await UserService.create_user(
            db,
            username=req.username,
            email=req.email,
            password=req.password,
            full_name=req.full_name,
            role_names=["user"]
        )
        return success({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name
        }, "注册成功")


@auth_bp.get("/me")
@login_required()
async def get_current_user_info(request: Request):
    user = request.ctx.user
    return success({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "is_superuser": user.is_superuser,
        "is_active": user.is_active,
        "roles": [{"id": r.id, "name": r.name, "description": r.description} for r in user.roles],
        "permissions": list(set(p.name for r in user.roles for p in r.permissions))
    })


@auth_bp.get("/users")
@permission_required("user:manage")
async def list_users(request: Request):
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))
    keyword = request.args.get("keyword")

    async with get_db() as db:
        users, total = await UserService.list_users(
            db,
            skip=(page - 1) * page_size,
            limit=page_size,
            keyword=keyword
        )
        user_list = [{
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "is_active": u.is_active,
            "is_superuser": u.is_superuser,
            "roles": [{"id": r.id, "name": r.name} for r in u.roles],
            "created_at": u.created_at.isoformat() if u.created_at else None
        } for u in users]
        return paginated_response(user_list, total, page, page_size)


@auth_bp.put("/users/<user_id:int>")
@permission_required("user:manage")
async def update_user(request: Request, user_id: int):
    req = UserUpdateRequest(**request.json)
    async with get_db() as db:
        user = await UserService.update_user(
            db,
            user_id,
            **req.model_dump(exclude_unset=True)
        )
        return success({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "is_active": user.is_active
        }, "更新成功")


@auth_bp.delete("/users/<user_id:int>")
@superuser_required()
async def delete_user(request: Request, user_id: int):
    async with get_db() as db:
        await UserService.delete_user(db, user_id)
        return success(message="删除成功")


@auth_bp.get("/roles")
@permission_required("role:manage")
async def list_roles(request: Request):
    async with get_db() as db:
        roles = await RoleService.list_roles(db)
        role_list = [{
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "permissions": [{"id": p.id, "name": p.name, "description": p.description} for p in r.permissions]
        } for r in roles]
        return success(role_list)


@auth_bp.post("/roles")
@permission_required("role:manage")
async def create_role(request: Request):
    req = RoleCreateRequest(**request.json)
    async with get_db() as db:
        role = await RoleService.create_role(
            db,
            name=req.name,
            description=req.description,
            permission_names=req.permission_names
        )
        return success({
            "id": role.id,
            "name": role.name,
            "description": role.description
        }, "角色创建成功")


@auth_bp.post("/roles/assign")
@permission_required("role:manage")
async def assign_roles(request: Request):
    req = AssignRoleRequest(**request.json)
    async with get_db() as db:
        user = await RoleService.assign_roles_to_user(db, req.user_id, req.role_ids)
        return success({
            "user_id": user.id,
            "username": user.username,
            "roles": [{"id": r.id, "name": r.name} for r in user.roles]
        }, "角色分配成功")


@auth_bp.get("/permissions")
@permission_required("role:manage")
async def list_permissions(request: Request):
    async with get_db() as db:
        permissions = await PermissionService.list_permissions(db)
        perm_list = [{
            "id": p.id,
            "name": p.name,
            "resource": p.resource,
            "action": p.action,
            "description": p.description
        } for p in permissions]
        return success(perm_list)
