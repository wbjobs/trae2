from typing import Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class Response(BaseModel, Generic[T]):
    code: int = Field(default=200, description="响应状态码")
    message: str = Field(default="success", description="响应消息")
    data: Optional[T] = Field(default=None, description="响应数据")


class Pagination(BaseModel):
    page: int = Field(default=1, ge=1, description="页码")
    page_size: int = Field(default=20, ge=1, le=100, description="每页数量")
    total: int = Field(default=0, description="总记录数")
    total_pages: int = Field(default=0, description="总页数")


class PaginatedResponse(BaseModel, Generic[T]):
    code: int = Field(default=200, description="响应状态码")
    message: str = Field(default="success", description="响应消息")
    data: List[T] = Field(default_factory=list, description="数据列表")
    pagination: Pagination = Field(default_factory=Pagination, description="分页信息")
