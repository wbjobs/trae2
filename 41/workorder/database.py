from sqlalchemy import create_engine, Column, String, Float, DateTime, Text, Enum as SAEnum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session
from contextlib import contextmanager
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared import settings, WorkOrderStatus, WorkOrderPriority

engine = create_engine(
    settings.DATABASE_URL.replace("pv_system", "pv_workorder"),
    connect_args={"check_same_thread": False},
    pool_size=5,
    max_overflow=10,
    pool_recycle=3600
)
SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
SessionLocal = scoped_session(SessionFactory)
Base = declarative_base()


class WorkOrderDB(Base):
    __tablename__ = "work_orders"

    work_order_id = Column(String, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(Text)
    status = Column(String, index=True)
    priority = Column(String, index=True)
    device_id = Column(String, index=True)
    device_name = Column(String)
    alert_id = Column(String)
    assigned_to = Column(String)
    created_at = Column(DateTime, index=True)
    due_date = Column(DateTime)
    completed_at = Column(DateTime)
    notes = Column(Text, default="[]")


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
