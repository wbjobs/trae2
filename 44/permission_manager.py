import threading
from typing import Dict, Optional, Set

from models import UserRole, ServiceOperation


class PermissionManager:
    _instance: Optional["PermissionManager"] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._role_permissions: Dict[UserRole, Set[str]] = {}
        self._permission_cache: Dict[str, bool] = {}
        self._cache_lock = threading.Lock()
        self._rw_lock = threading.RLock()

    def set_role_permissions(self, role: UserRole, operations: Set[str]) -> None:
        with self._rw_lock:
            self._role_permissions[role] = operations
        self._invalidate_cache()

    def add_role_permission(self, role: UserRole, operation: str) -> None:
        with self._rw_lock:
            if role not in self._role_permissions:
                self._role_permissions[role] = set()
            self._role_permissions[role].add(operation)
        self._invalidate_cache()

    def remove_role_permission(self, role: UserRole, operation: str) -> None:
        with self._rw_lock:
            if role in self._role_permissions:
                self._role_permissions[role].discard(operation)
        self._invalidate_cache()

    def check_permission(
        self, token_str: str, role: UserRole, required_operation: ServiceOperation
    ) -> bool:
        op_value = required_operation.value
        cache_key = f"{token_str}:{op_value}"
        with self._cache_lock:
            cached = self._permission_cache.get(cache_key)
            if cached is not None:
                return cached
        if role == UserRole.ADMIN:
            result = True
        else:
            with self._rw_lock:
                perms = self._role_permissions.get(role, set())
            result = op_value in perms
        with self._cache_lock:
            self._permission_cache[cache_key] = result
            if len(self._permission_cache) > 50000:
                self._permission_cache.clear()
        return result

    def _invalidate_cache(self) -> None:
        with self._cache_lock:
            self._permission_cache.clear()

    def get_permissions_for_role(self, role: UserRole) -> Set[str]:
        with self._rw_lock:
            return set(self._role_permissions.get(role, set()))

    def get_permission_stats(self) -> Dict:
        with self._cache_lock:
            cache_size = len(self._permission_cache)
        return {
            "roles_defined": len(self._role_permissions),
            "role_list": [r.value for r in self._role_permissions.keys()],
            "permission_cache_size": cache_size,
        }


_permission_manager_instance: Optional[PermissionManager] = None


def get_permission_manager() -> PermissionManager:
    global _permission_manager_instance
    if _permission_manager_instance is None:
        _permission_manager_instance = PermissionManager()
    return _permission_manager_instance