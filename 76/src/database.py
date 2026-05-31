from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os

from .config import settings

os.makedirs(os.path.dirname(settings.database_url.replace("sqlite:///", "")), exist_ok=True)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class AudioSample(Base):
    __tablename__ = "audio_samples"

    id = Column(Integer, primary_key=True, index=True)
    sample_id = Column(String(64), unique=True, index=True)
    motor_type = Column(String(64), index=True)
    fault_type = Column(String(64), index=True)
    fault_severity = Column(String(32))
    file_path = Column(String(255))
    file_name = Column(String(255))
    duration = Column(Float)
    sample_rate = Column(Integer)
    channels = Column(Integer)
    file_size = Column(Integer)
    is_labeled = Column(Boolean, default=False)
    label_source = Column(String(64))
    features = Column(Text)
    classification_result = Column(Text)
    confidence = Column(Float)
    recorded_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    diagnosis_records = relationship("DiagnosisRecord", back_populates="sample")


class DiagnosisRecord(Base):
    __tablename__ = "diagnosis_records"

    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(String(64), unique=True, index=True)
    sample_id = Column(String(64), ForeignKey("audio_samples.sample_id"))
    motor_id = Column(String(64), index=True)
    motor_type = Column(String(64))
    fault_type = Column(String(64))
    confidence = Column(Float)
    features = Column(Text)
    raw_audio_path = Column(String(255))
    denoised_audio_path = Column(String(255))
    processing_time_ms = Column(Float)
    is_realtime = Column(Boolean, default=False)
    status = Column(String(32), default="completed")
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    sample = relationship("AudioSample", back_populates="diagnosis_records")


class ModelInfo(Base):
    __tablename__ = "model_info"

    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(64), unique=True, index=True)
    model_version = Column(String(32))
    model_type = Column(String(64))
    model_path = Column(String(255))
    classes = Column(Text)
    accuracy = Column(Float)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class StreamSession(Base):
    __tablename__ = "stream_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(64), unique=True, index=True)
    motor_id = Column(String(64), index=True)
    client_ip = Column(String(64))
    status = Column(String(32), default="active")
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime)
    total_chunks = Column(Integer, default=0)
    total_duration = Column(Float, default=0.0)


class FinetuneJob(Base):
    __tablename__ = "finetune_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String(64), unique=True, index=True)
    status = Column(String(32), default="pending")
    description = Column(String(255))
    num_samples = Column(Integer, default=0)
    config = Column(Text)
    progress = Column(Float, default=0.0)
    train_accuracy = Column(Float)
    validation_accuracy = Column(Float)
    f1_score = Column(Float)
    precision = Column(Float)
    recall = Column(Float)
    model_updated = Column(Boolean, default=False)
    results = Column(Text)
    error_message = Column(Text)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)


class AudioMarker(Base):
    __tablename__ = "audio_markers"

    id = Column(Integer, primary_key=True, index=True)
    marker_id = Column(String(64), unique=True, index=True)
    sample_id = Column(String(64), index=True)
    start_time = Column(Float, nullable=False)
    end_time = Column(Float)
    label = Column(String(64), index=True)
    confidence = Column(Float)
    notes = Column(Text)
    metadata = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BatchJob(Base):
    __tablename__ = "batch_jobs"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(64), unique=True, index=True)
    status = Column(String(32), default="pending")
    total_files = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    config = Column(Text)
    results = Column(Text)
    error_message = Column(Text)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
