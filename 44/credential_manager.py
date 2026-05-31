import threading
from typing import Dict, List, Optional

from models import Credential, UserRole, ServiceOperation


class CredentialManager:
    _instance: Optional["CredentialManager"] = None
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
        self._credentials: Dict[str, Credential] = {}
        self._rw_lock = threading.RLock()
        self._bootstrap_defaults()

    def _bootstrap_defaults(self):
        defaults = [
            Credential(
                api_key="admin-key-001",
                role=UserRole.ADMIN,
                allowed_operations=[op.value for op in ServiceOperation],
                description="Default admin credential for bootstrapping",
            ),
            Credential(
                api_key="operator-key-001",
                role=UserRole.OPERATOR,
                allowed_operations=[
                    ServiceOperation.SIGNALING_RECEIVE.value,
                    ServiceOperation.SIGNALING_SEND.value,
                    ServiceOperation.TASK_CREATE.value,
                    ServiceOperation.TASK_UPDATE.value,
                    ServiceOperation.TASK_QUERY.value,
                    ServiceOperation.CHANNEL_QUERY.value,
                    ServiceOperation.CALLBACK_REGISTER.value,
                    ServiceOperation.TASK_PRIORITY_ADJUST.value,
                ],
                description="Default operator credential",
            ),
            Credential(
                api_key="service-key-001",
                role=UserRole.SERVICE,
                allowed_operations=[
                    ServiceOperation.SIGNALING_RECEIVE.value,
                    ServiceOperation.SIGNALING_SEND.value,
                    ServiceOperation.TASK_QUERY.value,
                    ServiceOperation.CHANNEL_QUERY.value,
                    ServiceOperation.CALLBACK_TRIGGER.value,
                    ServiceOperation.FAILURE_TRACE.value,
                ],
                description="Inter-service communication credential",
            ),
            Credential(
                api_key="monitor-key-001",
                role=UserRole.MONITOR,
                allowed_operations=[
                    ServiceOperation.TASK_QUERY.value,
                    ServiceOperation.CHANNEL_QUERY.value,
                    ServiceOperation.FAILURE_TRACE.value,
                ],
                description="Read-only monitoring credential",
            ),
        ]
        for cred in defaults:
            self._credentials[cred.api_key] = cred

    def register(self, credential: Credential) -> bool:
        with self._rw_lock:
            if credential.api_key in self._credentials:
                return False
            self._credentials[credential.api_key] = credential
            return True

    def revoke(self, api_key: str) -> bool:
        with self._rw_lock:
            return self._credentials.pop(api_key, None) is not None

    def get(self, api_key: str) -> Optional[Credential]:
        with self._rw_lock:
            return self._credentials.get(api_key)

    def list_all(self) -> List[Dict]:
        with self._rw_lock:
            return [
                {
                    "api_key": c.api_key[:8] + "***",
                    "role": c.role.value,
                    "allowed_operations": list(c.allowed_operations),
                    "description": c.description,
                    "created_at": c.created_at.isoformat(),
                }
                for c in self._credentials.values()
            ]

    def rotate_key(self, old_key: str, new_key: str) -> bool:
        with self._rw_lock:
            if old_key not in self._credentials:
                return False
            cred = self._credentials.pop(old_key)
            cred.api_key = new_key
            self._credentials[new_key] = cred
            return True

    def count(self) -> int:
        with self._rw_lock:
            return len(self._credentials)


_credential_manager_instance: Optional[CredentialManager] = None


def get_credential_manager() -> CredentialManager:
    global _credential_manager_instance
    if _credential_manager_instance is None:
        _credential_manager_instance = CredentialManager()
    return _credential_manager_instance