from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON, Float
from sqlalchemy.orm import relationship

from app.core.database import Base


class DocumentPolishTask(Base):
    __tablename__ = "document_polish_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(100), unique=True, index=True, nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    polish_type = Column(String(50), default="professional")
    tone = Column(String(50), default="formal")
    industry = Column(String(100))
    status = Column(String(50), default="pending")
    progress = Column(Integer, default=0)
    original_content = Column(Text)
    polished_content = Column(Text)
    error_message = Column(Text)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document")
    user = relationship("User")
    polish_items = relationship("PolishItem", back_populates="task")


class PolishItem(Base):
    __tablename__ = "polish_items"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("document_polish_tasks.id"))
    polish_type = Column(String(50))
    original_text = Column(String(1000))
    polished_text = Column(String(1000))
    position_start = Column(Integer)
    position_end = Column(Integer)
    paragraph = Column(Integer)
    explanation = Column(Text)
    severity = Column(String(20), default="medium")
    confidence = Column(Float, default=0.0)
    accepted = Column(Integer, default=0)

    task = relationship("DocumentPolishTask", back_populates="polish_items")


class TaskLog(Base):
    __tablename__ = "task_logs"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(100), index=True, nullable=False)
    task_type = Column(String(50))
    status = Column(String(50))
    message = Column(String(500))
    details = Column(JSON)
    duration_ms = Column(Integer)
    retry_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
