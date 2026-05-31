import hashlib
import base64
import threading
from typing import Dict, Optional
from datetime import datetime, timedelta

from config import get_config
from models import AuthToken, UserRole


class TokenManager:
    _instance: Optional["TokenManager"] = None
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
        self._config = get_config().auth
        self._tokens: Dict[str, AuthToken] = {}
        self._token_cache: Dict[str, tuple] = {}
        self._cache_lock = threading.Lock()
        self._rw_lock = threading.RLock()

    def generate_token(self, api_key: str, role: UserRole) -> AuthToken:
        now = datetime.utcnow()
        expires_at = now + timedelta(seconds=self._config.token_ttl)
        raw = f"{api_key}:{now.timestamp()}:{role.value}:{self._config.secret_key}"
        token_hash = hashlib.sha256(raw.encode()).hexdigest()
        token = base64.urlsafe_b64encode(
            f"{api_key}:{token_hash}".encode()
        ).decode().rstrip("=")
        auth_token = AuthToken(token=token, expires_at=expires_at, role=role)
        with self._rw_lock:
            self._tokens[token] = auth_token
        with self._cache_lock:
            self._token_cache[token] = (role, expires_at.timestamp())
        return auth_token

    def verify_token(self, token_str: str) -> Optional[AuthToken]:
        now_ts = datetime.utcnow().timestamp()
        with self._cache_lock:
            cached = self._token_cache.get(token_str)
            if cached:
                role, expire_ts = cached
                if now_ts < expire_ts:
                    return AuthToken(
                        token=token_str,
                        expires_at=datetime.fromtimestamp(expire_ts),
                        role=role,
                    )
                else:
                    del self._token_cache[token_str]
                    return None
        with self._rw_lock:
            token = self._tokens.get(token_str)
            if token is None:
                return None
            if now_ts > token.expires_at.timestamp():
                del self._tokens[token_str]
                return None
            with self._cache_lock:
                self._token_cache[token_str] = (token.role, token.expires_at.timestamp())
            return token

    def invalidate_token(self, token_str: str) -> bool:
        with self._rw_lock:
            removed = self._tokens.pop(token_str, None)
        with self._cache_lock:
            self._token_cache.pop(token_str, None)
        return removed is not None

    def invalidate_all_for_key(self, api_key_prefix: str) -> int:
        count = 0
        with self._rw_lock:
            to_remove = [
                t for t in self._tokens
                if t.startswith(api_key_prefix)
            ]
            for t in to_remove:
                del self._tokens[t]
                count += 1
        with self._cache_lock:
            to_remove = [
                k for k in self._token_cache
                if k.startswith(api_key_prefix)
            ]
            for k in to_remove:
                del self._token_cache[k]
        return count

    def get_token_stats(self) -> Dict:
        with self._cache_lock:
            cache_size = len(self._token_cache)
        return {
            "active_tokens": len(self._tokens),
            "token_cache_size": cache_size,
            "cache_hit_ratio": 0.0,
        }


_token_manager_instance: Optional[TokenManager] = None


def get_token_manager() -> TokenManager:
    global _token_manager_instance
    if _token_manager_instance is None:
        _token_manager_instance = TokenManager()
    return _token_manager_instance