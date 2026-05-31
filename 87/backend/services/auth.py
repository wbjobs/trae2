from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.config import settings
from backend.database.clickhouse import get_client, execute_query
from backend.utils.logger import setup_logger

logger = setup_logger()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = get_user_by_username(username)
    if user is None:
        raise credentials_exception
    return user


def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    try:
        query = """
            SELECT user_id, username, email, full_name, role, permissions, factories, is_active
            FROM users
            WHERE username = %(username)s AND is_active = true
            LIMIT 1
        """
        users = execute_query(query, {"username": username})
        if users:
            user = users[0]
            return {
                "user_id": str(user["user_id"]),
                "username": user["username"],
                "email": user["email"],
                "full_name": user["full_name"],
                "role": user["role"],
                "permissions": list(user["permissions"]),
                "factories": list(user["factories"]),
                "is_active": bool(user["is_active"])
            }
    except Exception as e:
        logger.error(f"Error getting user by username: {e}")
    return None


def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    try:
        query = """
            SELECT user_id, username, email, hashed_password, full_name, role, permissions, factories, is_active
            FROM users
            WHERE username = %(username)s AND is_active = true
            LIMIT 1
        """
        users = execute_query(query, {"username": username})
        if users:
            user = users[0]
            if verify_password(password, user["hashed_password"]):
                client = get_client()
                client.command(f"""
                    ALTER TABLE users UPDATE last_login = now()
                    WHERE username = '{username}'
                """)
                return {
                    "user_id": str(user["user_id"]),
                    "username": user["username"],
                    "email": user["email"],
                    "full_name": user["full_name"],
                    "role": user["role"],
                    "permissions": list(user["permissions"]),
                    "factories": list(user["factories"]),
                    "is_active": bool(user["is_active"])
                }
    except Exception as e:
        logger.error(f"Authentication error: {e}")
    return None


def check_permission(user: Dict[str, Any], required_permission: str) -> bool:
    if user["role"] == "admin":
        return True
    return required_permission in user["permissions"]


def check_factory_access(user: Dict[str, Any], factory_id: str) -> bool:
    if user["role"] == "admin" or "*" in user["factories"]:
        return True
    return factory_id in user["factories"]
