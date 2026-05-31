from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from datetime import timedelta
from typing import Optional, List

from backend.services.auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_user_by_username,
    check_permission,
    get_password_hash
)
from backend.config import settings
from backend.database.clickhouse import get_client, execute_query
from backend.utils.logger import setup_logger

logger = setup_logger()
router = APIRouter()


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    role: str = "viewer"
    permissions: List[str] = ["read"]
    factories: List[str] = []


class UserResponse(BaseModel):
    user_id: str
    username: str
    email: str
    full_name: Optional[str]
    role: str
    permissions: List[str]
    factories: List[str]
    is_active: bool


@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"], "role": user["role"]},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.post("/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    current_user: dict = Depends(get_current_user)
):
    if not check_permission(current_user, "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有创建用户的权限"
        )
    
    existing_user = get_user_by_username(user_data.username)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )
    
    hashed_password = get_password_hash(user_data.password)
    client = get_client()
    
    factories_str = str(user_data.factories).replace("'", "'")
    permissions_str = str(user_data.permissions).replace("'", "'")
    
    query = f"""
        INSERT INTO users 
        (username, email, hashed_password, full_name, role, permissions, factories, is_active)
        VALUES
        ('{user_data.username}', '{user_data.email}', '{hashed_password}', 
         '{user_data.full_name or ''}', '{user_data.role}', {permissions_str}, {factories_str}, true)
    """
    
    client.command(query)
    
    new_user = get_user_by_username(user_data.username)
    if not new_user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="创建用户失败"
        )
    
    return new_user


@router.get("/users")
async def get_users(
    current_user: dict = Depends(get_current_user),
    limit: int = 100
):
    if not check_permission(current_user, "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有查看用户列表的权限"
        )
    
    query = """
        SELECT user_id, username, email, full_name, role, permissions, factories, is_active, created_at, last_login
        FROM users
        ORDER BY created_at DESC
        LIMIT %(limit)s
    """
    
    users = execute_query(query, {"limit": limit})
    return {"users": users}


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    user_data: dict,
    current_user: dict = Depends(get_current_user)
):
    if not check_permission(current_user, "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有更新用户的权限"
        )
    
    client = get_client()
    update_fields = []
    
    if "role" in user_data:
        update_fields.append(f"role = '{user_data['role']}'")
    if "permissions" in user_data:
        permissions_str = str(user_data["permissions"]).replace("'", "'")
        update_fields.append(f"permissions = {permissions_str}")
    if "factories" in user_data:
        factories_str = str(user_data["factories"]).replace("'", "'")
        update_fields.append(f"factories = {factories_str}")
    if "is_active" in user_data:
        update_fields.append(f"is_active = {user_data['is_active']}")
    
    if update_fields:
        query = f"""
            ALTER TABLE users UPDATE {', '.join(update_fields)}
            WHERE user_id = '{user_id}'
        """
        client.command(query)
    
    return {"message": "用户更新成功"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    if not check_permission(current_user, "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有删除用户的权限"
        )
    
    client = get_client()
    query = f"""
        ALTER TABLE users DELETE WHERE user_id = '{user_id}'
    """
    client.command(query)
    
    return {"message": "用户删除成功"}
