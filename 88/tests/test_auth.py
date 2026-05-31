import pytest
from app.auth.jwt_handler import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.auth.roles import has_permission, Role, get_role_permissions


def test_password_hashing():
    hashed = hash_password("test123")
    assert verify_password("test123", hashed)
    assert not verify_password("wrong", hashed)


def test_access_token():
    token = create_access_token({"sub": "user123"})
    payload = decode_token(token)
    assert payload["sub"] == "user123"
    assert payload["type"] == "access"


def test_refresh_token():
    token = create_refresh_token({"sub": "user123"})
    payload = decode_token(token)
    assert payload["sub"] == "user123"
    assert payload["type"] == "refresh"


def test_invalid_token():
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        decode_token("invalid_token_here")


def test_role_permissions():
    assert has_permission("admin", "manage_users")
    assert has_permission("admin", "upload")
    assert has_permission("user", "upload")
    assert not has_permission("user", "manage_users")
    assert has_permission("viewer", "search")
    assert not has_permission("viewer", "upload")


def test_get_role_permissions():
    admin_perms = get_role_permissions("admin")
    assert "manage_users" in admin_perms
    user_perms = get_role_permissions("user")
    assert "upload" in user_perms
    assert "manage_users" not in user_perms
