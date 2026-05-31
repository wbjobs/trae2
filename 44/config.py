from pydantic import BaseModel, Field
from typing import List, Dict


class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8600
    workers: int = 4


class CacheConfig(BaseModel):
    task_ttl: int = 3600
    channel_ttl: int = 7200
    signaling_ttl: int = 1800
    max_entries: int = 10000


class AuthConfig(BaseModel):
    secret_key: str = "gs-sched-2024-secret"
    token_ttl: int = 7200
    algorithm: str = "HS256"


class ServiceEndpoint(BaseModel):
    name: str
    url: str
    weight: int = 1


class ClusterConfig(BaseModel):
    signaling_service: ServiceEndpoint = ServiceEndpoint(
        name="signaling", url="http://127.0.0.1:8600"
    )
    scheduler_service: ServiceEndpoint = ServiceEndpoint(
        name="scheduler", url="http://127.0.0.1:8601"
    )
    channel_service: ServiceEndpoint = ServiceEndpoint(
        name="channel", url="http://127.0.0.1:8602"
    )
    callback_service: ServiceEndpoint = ServiceEndpoint(
        name="callback", url="http://127.0.0.1:8603"
    )
    auth_service: ServiceEndpoint = ServiceEndpoint(
        name="auth", url="http://127.0.0.1:8604"
    )


class AppConfig(BaseModel):
    server: ServerConfig = ServerConfig()
    cache: CacheConfig = CacheConfig()
    auth: AuthConfig = AuthConfig()
    cluster: ClusterConfig = ClusterConfig()
    api_prefix: str = "/api/v1"


_config_instance: AppConfig | None = None


def get_config() -> AppConfig:
    global _config_instance
    if _config_instance is None:
        _config_instance = AppConfig()
    return _config_instance