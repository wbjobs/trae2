from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON, Float
from sqlalchemy.orm import relationship

from app.core.database import Base


class ProofreadTask(Base):
    __tablename__ = "proofread_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(100), unique=True, index=True, nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    task_type = Column(String(50), default="full")
    industry = Column(String(100))
    status = Column(String(50), default="pending")
    priority = Column(Integer, default=5)
    progress = Column(Integer, default=0)
    error_message = Column(Text)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document", back_populates="tasks")
    user = relationship("User", back_populates="tasks")
    result = relationship("TaskResult", back_populates="task", uselist=False)


class TaskResult(Base):
    __tablename__ = "task_results"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("proofread_tasks.id"))
    original_content = Column(Text)
    corrected_content = Column(Text)
    summary = Column(JSON)
    total_corrections = Column(Integer, default=0)
    spelling_errors = Column(Integer, default=0)
    grammar_errors = Column(Integer, default=0)
    terminology_errors = Column(Integer, default=0)
    format_errors = Column(Integer, default=0)
    confidence_score = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("ProofreadTask", back_populates="result")
    corrections = relationship("CorrectionItem", back_populates="result")


class CorrectionItem(Base):
    __tablename__ = "correction_items"

    id = Column(Integer, primary_key=True, index=True)
    result_id = Column(Integer, ForeignKey("task_results.id"))
    correction_type = Column(String(50))
    original_text = Column(String(500))
    corrected_text = Column(String(500))
    position_start = Column(Integer)
    position_end = Column(Integer)
    paragraph = Column(Integer)
    line_number = Column(Integer)
    explanation = Column(Text)
    severity = Column(String(20), default="medium")
    confidence = Column(Float, default=0.0)
    accepted = Column(Integer, default=0)

    result = relationship("TaskResult", back_populates="corrections")
