from enum import Enum


class Role(str, Enum):
    ADMIN = "admin"
    USER = "user"
    VIEWER = "viewer"


ROLE_PERMISSIONS = {
    Role.ADMIN: {"upload", "process", "search", "export", "manage_users", "manage_tasks"},
    Role.USER: {"upload", "process", "search", "export"},
    Role.VIEWER: {"search", "export"},
}


def has_permission(role: str, permission: str) -> bool:
    try:
        role_enum = Role(role)
        return permission in ROLE_PERMISSIONS.get(role_enum, set())
    except ValueError:
        return False


def get_role_permissions(role: str) -> set:
    try:
        role_enum = Role(role)
        return ROLE_PERMISSIONS.get(role_enum, set())
    except ValueError:
        return set()
