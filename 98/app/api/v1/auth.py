from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import UnauthorizedException
from app.schemas.user import User, UserCreate, Token
from app.schemas.common import Response
from app.services.user_service import user_service

router = APIRouter()


@router.post("/register", response_model=Response[User])
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    user = await user_service.create_user(db, user_in)
    return Response(data=user, message="注册成功")


@router.post("/login", response_model=Response[Token])
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    user = await user_service.authenticate(
        db, form_data.username, form_data.password
    )
    if not user:
        raise UnauthorizedException(detail="用户名或密码错误")

    token = await user_service.create_access_token(user)
    return Response(data=token, message="登录成功")


@router.get("/me", response_model=Response[User])
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    return Response(data=current_user, message="获取成功")
