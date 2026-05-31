from typing import Optional

from models import (
    Credential,
    UserRole,
    ServiceOperation,
    AuthToken,
    ApiResponse,
)
from token_manager import get_token_manager, TokenManager
from permission_manager import get_permission_manager, PermissionManager
from credential_manager import get_credential_manager, CredentialManager


class AuthManager:
    _instance: Optional["AuthManager"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._token_mgr: TokenManager = get_token_manager()
        self._perm_mgr: PermissionManager = get_permission_manager()
        self._cred_mgr: CredentialManager = get_credential_manager()
        self._sync_role_permissions()

    def _sync_role_permissions(self) -> None:
        for cred in self._cred_mgr._credentials.values():
            self._perm_mgr.set_role_permissions(
                cred.role, set(cred.allowed_operations)
            )

    def authenticate(self, api_key: str) -> Optional[AuthToken]:
        credential = self._cred_mgr.get(api_key)
        if credential is None:
            return None
        self._perm_mgr.set_role_permissions(
            credential.role, set(credential.allowed_operations)
        )
        return self._token_mgr.generate_token(api_key, credential.role)

    def verify_token(self, token_str: str) -> Optional[AuthToken]:
        return self._token_mgr.verify_token(token_str)

    def check_permission(
        self, token_str: str, required_operation: ServiceOperation
    ) -> bool:
        token = self.verify_token(token_str)
        if token is None:
            return False
        return self._perm_mgr.check_permission(
            token_str, token.role, required_operation
        )

    def get_role(self, token_str: str) -> Optional[UserRole]:
        token = self.verify_token(token_str)
        return token.role if token else None

    def register_credential(self, credential: Credential) -> bool:
        result = self._cred_mgr.register(credential)
        if result:
            self._perm_mgr.set_role_permissions(
                credential.role, set(credential.allowed_operations)
            )
        return result

    def revoke_credential(self, api_key: str) -> bool:
        result = self._cred_mgr.revoke(api_key)
        if result:
            self._token_mgr.invalidate_all_for_key(api_key)
        return result

    def invalidate_token(self, token_str: str) -> bool:
        return self._token_mgr.invalidate_token(token_str)

    def list_credentials(self):
        return self._cred_mgr.list_all()

    def rotate_key(self, old_key: str, new_key: str) -> bool:
        return self._cred_mgr.rotate_key(old_key, new_key)

    def get_auth_stats(self) -> dict:
        token_stats = self._token_mgr.get_token_stats()
        perm_stats = self._perm_mgr.get_permission_stats()
        return {
            **token_stats,
            **perm_stats,
            "credentials_count": self._cred_mgr.count(),
        }


_auth_instance: Optional[AuthManager] = None


def get_auth_manager() -> AuthManager:
    global _auth_instance
    if _auth_instance is None:
        _auth_instance = AuthManager()
    return _auth_instance


def require_auth(operation: ServiceOperation):
    def decorator(func):
        async def wrapper(*args, **kwargs):
            request = kwargs.get("request")
            if request is None and args:
                request = args[0]
            token = None
            if request is not None:
                auth_header = request.headers.get("Authorization", "")
                if auth_header.startswith("Bearer "):
                    token = auth_header[7:]
                elif auth_header.startswith("ApiKey "):
                    api_key = auth_header[7:]
                    auth_mgr = get_auth_manager()
                    auth_result = auth_mgr.authenticate(api_key)
                    if auth_result:
                        token = auth_result.token
            if token is None:
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    status_code=401,
                    content=ApiResponse(
                        code=401, message="Authentication required"
                    ).model_dump(),
                )
            auth_mgr = get_auth_manager()
            if not auth_mgr.check_permission(token, operation):
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    status_code=403,
                    content=ApiResponse(
                        code=403, message="Permission denied"
                    ).model_dump(),
                )
            kwargs["user_role"] = auth_mgr.get_role(token)
            return await func(*args, **kwargs)
        wrapper.__name__ = func.__name__
        wrapper.__wrapped__ = func
        return wrapper
    return decorator