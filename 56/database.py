from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import json

from config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class AudioSample(Base):
    __tablename__ = "audio_samples"

    id = Column(Integer, primary_key=True, index=True)
    sample_id = Column(String(64), unique=True, index=True)
    device_id = Column(String(64), index=True)
    file_path = Column(String(255))
    file_name = Column(String(255))
    duration = Column(Float)
    sample_rate = Column(Integer)
    channels = Column(Integer)
    file_size = Column(Integer)

    fault_type = Column(String(64), index=True)
    fault_severity = Column(String(32))
    is_labeled = Column(Boolean, default=False)

    features_json = Column(Text)
    classification_result = Column(String(64))
    classification_confidence = Column(Float)

    noise_level_before = Column(Float)
    noise_level_after = Column(Float)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def set_features(self, features_dict):
        self.features_json = json.dumps(features_dict)

    def get_features(self):
        return json.loads(self.features_json) if self.features_json else {}


class DeviceInfo(Base):
    __tablename__ = "device_info"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(64), unique=True, index=True)
    device_name = Column(String(128))
    device_type = Column(String(64))
    location = Column(String(128))
    status = Column(String(32), default="active")
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class ClassificationModel(Base):
    __tablename__ = "classification_models"

    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(128))
    model_version = Column(String(32))
    model_path = Column(String(255))
    accuracy = Column(Float)
    fault_types = Column(Text)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    def set_fault_types(self, fault_list):
        self.fault_types = json.dumps(fault_list)

    def get_fault_types(self):
        return json.loads(self.fault_types) if self.fault_types else []


class ProcessingLog(Base):
    __tablename__ = "processing_logs"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(64), index=True)
    device_id = Column(String(64), index=True)
    stage = Column(String(32))
    status = Column(String(32))
    message = Column(Text)
    processing_time = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)
