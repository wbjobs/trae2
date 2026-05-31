from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Float
from sqlalchemy.orm import relationship
from app.core import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    task_type = Column(String(50), nullable=False)
    status = Column(String(50), default="pending")
    progress = Column(Integer, default=0)
    total = Column(Integer, default=0)
    completed = Column(Integer, default=0)
    failed = Column(Integer, default=0)
    params = Column(JSON)
    result_summary = Column(JSON)
    error_message = Column(Text)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    creator_id = Column(Integer, ForeignKey("users.id"))
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = relationship("User", back_populates="tasks")
    results = relationship("ComparisonResult", back_populates="task")
    logs = relationship("TaskLog", back_populates="task", order_by="TaskLog.id.desc()")


class TaskLog(Base):
    __tablename__ = "task_logs"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    level = Column(String(20), nullable=False, default="info")
    message = Column(Text, nullable=False)
    details = Column(JSON)
    duration_ms = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("Task", back_populates="logs")
