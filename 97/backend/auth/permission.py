from typing import Dict, List, Optional, Set
from enum import Enum
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))


class Role(str, Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"
    GUEST = "guest"


class Permission(str, Enum):
    VIEW_DASHBOARD = "view:dashboard"
    VIEW_DATA = "view:data"
    EDIT_DATA = "edit:data"
    DELETE_DATA = "delete:data"
    EXPORT_REPORT = "export:report"
    MANAGE_USERS = "manage:users"
    MANAGE_DEVICES = "manage:devices"
    RUN_CLEANING = "run:cleaning"
    RUN_AGGREGATION = "run:aggregation"


ROLE_PERMISSIONS = {
    Role.ADMIN: {p.value for p in Permission},
    Role.OPERATOR: {
        Permission.VIEW_DASHBOARD.value,
        Permission.VIEW_DATA.value,
        Permission.EDIT_DATA.value,
        Permission.EXPORT_REPORT.value,
        Permission.RUN_CLEANING.value,
        Permission.RUN_AGGREGATION.value,
    },
    Role.VIEWER: {
        Permission.VIEW_DASHBOARD.value,
        Permission.VIEW_DATA.value,
        Permission.EXPORT_REPORT.value,
    },
    Role.GUEST: {
        Permission.VIEW_DASHBOARD.value,
    }
}


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token")


class PermissionManager:
    def __init__(self):
        self.role_permissions = ROLE_PERMISSIONS

    def get_role_permissions(self, role: str) -> Set[str]:
        return self.role_permissions.get(Role(role), set())

    def has_permission(self, role: str, permission: str) -> bool:
        permissions = self.get_role_permissions(role)
        return permission in permissions

    def has_any_permission(self, role: str, permissions: List[str]) -> bool:
        user_permissions = self.get_role_permissions(role)
        return any(p in user_permissions for p in permissions)

    def has_all_permissions(self, role: str, permissions: List[str]) -> bool:
        user_permissions = self.get_role_permissions(role)
        return all(p in user_permissions for p in permissions)

    def check_data_access(self, user: Dict, device_ids: Optional[List[str]] = None) -> bool:
        if user.get("role") == Role.ADMIN:
            return True
        
        allowed_devices = user.get("permissions", {}).get("allowed_devices", [])
        if not allowed_devices or not device_ids:
            return True
        
        return all(d in allowed_devices for d in device_ids)

    def filter_allowed_devices(self, user: Dict, device_ids: List[str]) -> List[str]:
        if user.get("role") == Role.ADMIN:
            return device_ids
        
        allowed_devices = user.get("permissions", {}).get("allowed_devices", [])
        if not allowed_devices:
            return []
        
        return [d for d in device_ids if d in allowed_devices]


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: Dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[Dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


permission_manager = PermissionManager()
