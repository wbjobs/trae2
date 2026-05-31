from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Enum, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class BatchStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    PARTIAL_COMPLETED = "partial_completed"
    COMPLETED = "completed"
    FAILED = "failed"


class ExtractionTask(Base):
    __tablename__ = "extraction_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(64), unique=True, index=True, nullable=False)
    batch_id = Column(String(64), ForeignKey("extraction_batches.batch_id"), nullable=True, index=True)
    original_text = Column(Text, nullable=False)
    schema_definition = Column(JSON, nullable=False)
    status = Column(Enum(TaskStatus), default=TaskStatus.PENDING, index=True)
    result = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    preprocessed_text = Column(Text, nullable=True)
    llm_response = Column(Text, nullable=True)
    content_hash = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    batch = relationship("ExtractionBatch", back_populates="tasks")

    __table_args__ = (
        Index("idx_task_status_created", "status", "created_at"),
    )


class ExtractionBatch(Base):
    __tablename__ = "extraction_batches"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(64), unique=True, index=True, nullable=False)
    total_count = Column(Integer, default=0)
    completed_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    status = Column(Enum(BatchStatus), default=BatchStatus.PENDING, index=True)
    schema_definition = Column(JSON, nullable=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    tasks = relationship("ExtractionTask", back_populates="batch", lazy="dynamic")

    __table_args__ = (
        Index("idx_batch_status_created", "status", "created_at"),
    )
