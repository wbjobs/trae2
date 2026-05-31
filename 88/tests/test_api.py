import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import init_db, get_db, async_session
from app.models import User
from app.auth.jwt_handler import hash_password


@pytest.fixture
async def db_session():
    await init_db()
    async with async_session() as session:
        yield session


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def auth_token(client: AsyncClient, db_session):
    from app.models import Base
    from app.database import engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    user = User(
        username="testuser",
        email="test@test.com",
        hashed_password=hash_password("testpass123"),
        role="user",
    )
    async with async_session() as session:
        session.add(user)
        await session.commit()

    resp = await client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "testpass123",
    })
    data = resp.json()
    return data["access_token"]


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient):
    from app.models import Base
    from app.database import engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    resp = await client.post("/api/v1/auth/register", json={
        "username": "newuser",
        "email": "new@test.com",
        "password": "newpass123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True

    resp = await client.post("/api/v1/auth/login", json={
        "username": "newuser",
        "password": "newpass123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data


@pytest.mark.asyncio
async def test_unauthorized_access(client: AsyncClient):
    resp = await client.get("/api/v1/documents")
    assert resp.status_code == 403
