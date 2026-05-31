from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50), nullable=False)
    file_size = Column(Integer)
    doc_type = Column(String(50), nullable=False)
    content = Column(Text)
    parsed_content = Column(JSON)
    status = Column(String(50), default="pending")
    error_message = Column(Text)
    uploader_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    uploader = relationship("User", back_populates="documents")


class Law(Base):
    __tablename__ = "laws"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    article_no = Column(String(100))
    law_type = Column(String(50))
    category = Column(String(100))
    chapter = Column(String(200))
    section = Column(String(200))
    content = Column(Text, nullable=False)
    source = Column(String(500))
    effective_date = Column(DateTime)
    status = Column(String(50), default="active")
    tags = Column(JSON)
    es_indexed = Column(Integer, default=0)
    document_id = Column(Integer, ForeignKey("documents.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    case_no = Column(String(200))
    court = Column(String(200))
    case_type = Column(String(100))
    judgment_date = Column(DateTime)
    parties = Column(JSON)
    summary = Column(Text)
    content = Column(Text, nullable=False)
    legal_basis = Column(Text)
    judgment_result = Column(Text)
    tags = Column(JSON)
    es_indexed = Column(Integer, default=0)
    document_id = Column(Integer, ForeignKey("documents.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ComparisonResult(Base):
    __tablename__ = "comparison_results"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"))
    case_id = Column(Integer, ForeignKey("cases.id"))
    law_id = Column(Integer, ForeignKey("laws.id"))
    similarity_score = Column(Integer)
    matching_analysis = Column(Text)
    key_points = Column(JSON)
    recommendations = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("Task", back_populates="results")
