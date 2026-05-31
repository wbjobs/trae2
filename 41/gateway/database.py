from sqlalchemy import create_engine, Column, String, Float, DateTime, Boolean, Enum, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session
from contextlib import contextmanager
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_size=10,
    max_overflow=20,
    pool_recycle=3600
)
SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
SessionLocal = scoped_session(SessionFactory)
Base = declarative_base()


class PVStringDataDB(Base):
    __tablename__ = "pv_string_data"

    id = Column(String, primary_key=True, index=True)
    string_id = Column(String, index=True)
    timestamp = Column(DateTime, index=True)
    voltage = Column(Float)
    current = Column(Float)
    temperature = Column(Float)
    power = Column(Float)


class DeviceDB(Base):
    __tablename__ = "devices"

    device_id = Column(String, primary_key=True, index=True)
    device_name = Column(String)
    device_type = Column(String)
    status = Column(String)
    location = Column(String)
    region = Column(String, default="beijing")
    parent_id = Column(String)
    config = Column(Text)
    last_seen = Column(DateTime)


class StationSummaryDB(Base):
    __tablename__ = "station_summary"

    id = Column(String, primary_key=True, index=True)
    station_id = Column(String, index=True)
    region = Column(String)
    summary_date = Column(DateTime, index=True)
    total_power = Column(Float, default=0)
    total_energy = Column(Float, default=0)
    peak_power = Column(Float, default=0)
    device_count = Column(Integer, default=0)


@contextmanager
def get_db_session():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
