from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import Optional
from datetime import timedelta

from auth.permission import (
    create_access_token,
    verify_password,
    get_password_hash,
    decode_token,
    permission_manager,
    Role,
    Permission
)

router = APIRouter()


class Token(BaseModel):
    access_token: str
    token_type: str


class User(BaseModel):
    user_id: str
    username: str
    email: Optional[str] = None
    role: str
    permissions: Optional[dict] = None


class UserInDB(User):
    hashed_password: str


mock_users_db = {
    "admin": {
        "user_id": "user_001",
        "username": "admin",
        "email": "admin@example.com",
        "role": Role.ADMIN.value,
        "hashed_password": get_password_hash("admin123"),
        "permissions": {"allowed_devices": ["DEV001", "DEV002", "DEV003", "DEV004", "DEV005", "DEV006"]}
    },
    "operator": {
        "user_id": "user_002",
        "username": "operator",
        "email": "operator@example.com",
        "role": Role.OPERATOR.value,
        "hashed_password": get_password_hash("operator123"),
        "permissions": {"allowed_devices": ["DEV001", "DEV002", "DEV003"]}
    },
    "viewer": {
        "user_id": "user_003",
        "username": "viewer",
        "email": "viewer@example.com",
        "role": Role.VIEWER.value,
        "hashed_password": get_password_hash("viewer123"),
        "permissions": {"allowed_devices": ["DEV001", "DEV002"]}
    }
}


def get_user(username: str):
    if username in mock_users_db:
        user_dict = mock_users_db[username]
        return UserInDB(**user_dict)
    return None


def get_current_user(token: str = Depends(lambda: None)):
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    username = payload.get("sub")
    if not username:
        return None
    return get_user(username)


@router.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_user(form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=60 * 24)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    return {
        "user_id": current_user.user_id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
        "permissions": current_user.permissions
    }


@router.get("/roles")
async def get_roles():
    return {role.value: list(permission_manager.get_role_permissions(role.value)) for role in Role}
