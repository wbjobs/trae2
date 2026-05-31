from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class DocumentBase(BaseModel):
    title: str = Field(..., max_length=255, description="文档标题")
    industry: Optional[str] = Field(None, max_length=100, description="所属行业")


class DocumentCreate(DocumentBase):
    filename: str
    file_path: str
    file_size: Optional[int] = None
    file_type: Optional[str] = None
    content: Optional[str] = None


class DocumentUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255, description="文档标题")
    industry: Optional[str] = Field(None, max_length=100, description="所属行业")
    status: Optional[str] = Field(None, max_length=50, description="状态")


class Document(DocumentBase):
    id: int
    filename: str
    file_size: Optional[int]
    file_type: Optional[str]
    status: str
    owner_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentParseResult(BaseModel):
    success: bool
    content: Optional[str] = None
    word_count: int = 0
    paragraph_count: int = 0
    error: Optional[str] = None
