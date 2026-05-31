import logging
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, Float, JSON, ForeignKey, LargeBinary, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.dialects.postgresql import ARRAY
from datetime import datetime
from config import settings

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DATABASE_ECHO,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=30,
    pool_recycle=3600
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class DocumentDB(Base):
    """文档基本信息表"""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False, index=True)
    file_type = Column(String(20), nullable=False)
    file_size = Column(Integer, nullable=False)
    file_path = Column(String(500), nullable=False)
    upload_time = Column(DateTime, default=datetime.now, index=True)
    status = Column(String(50), default="pending", index=True)
    error_message = Column(Text, nullable=True)
    priority = Column(Integer, default=0, index=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    content = relationship("DocumentContentDB", back_populates="document", uselist=False, cascade="all, delete-orphan")
    semantic_features = relationship("SemanticFeatureDB", back_populates="document", uselist=False, cascade="all, delete-orphan")
    highlights = relationship("HighlightInfoDB", back_populates="document", uselist=False, cascade="all, delete-orphan")
    classification = relationship("ClassificationResultDB", back_populates="document", uselist=False, cascade="all, delete-orphan")
    feedback = relationship("ClassificationFeedbackDB", back_populates="document", uselist=False, cascade="all, delete-orphan")


class DocumentContentDB(Base):
    """文档内容表"""
    __tablename__ = "document_contents"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, unique=True, index=True)
    raw_text = Column(Text, nullable=False)
    cleaned_text = Column(Text, nullable=True)
    page_count = Column(Integer, nullable=True)
    paragraph_count = Column(Integer, nullable=True)
    metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    document = relationship("DocumentDB", back_populates="content")


class SemanticFeatureDB(Base):
    """语义特征表"""
    __tablename__ = "semantic_features"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, unique=True, index=True)
    keywords = Column(ARRAY(String), nullable=True)
    summary = Column(Text, nullable=True)
    topics = Column(ARRAY(String), nullable=True)
    entities = Column(JSON, nullable=True)
    embedding = Column(JSON, nullable=True)
    sentiment = Column(Float, nullable=True)
    key_phrases = Column(ARRAY(String), nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    document = relationship("DocumentDB", back_populates="semantic_features")


class HighlightInfoDB(Base):
    """关键信息高亮表"""
    __tablename__ = "highlight_infos"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, unique=True, index=True)
    key_paragraphs = Column(JSON, nullable=True)
    key_sentences = Column(JSON, nullable=True)
    important_terms = Column(JSON, nullable=True)
    title_highlights = Column(JSON, nullable=True)
    confidence_scores = Column(JSON, nullable=True)
    extract_time = Column(DateTime, default=datetime.now)
    created_at = Column(DateTime, default=datetime.now)

    document = relationship("DocumentDB", back_populates="highlights")


class ClassificationResultDB(Base):
    """分类结果表"""
    __tablename__ = "classification_results"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, unique=True, index=True)
    primary_category = Column(String(100), nullable=False, index=True)
    secondary_categories = Column(ARRAY(String), nullable=True)
    confidence = Column(Float, nullable=False)
    category_scores = Column(JSON, nullable=True)
    model_version = Column(String(50), nullable=True)
    classification_time = Column(DateTime, default=datetime.now)
    created_at = Column(DateTime, default=datetime.now)

    document = relationship("DocumentDB", back_populates="classification")


class ClassificationFeedbackDB(Base):
    """分类反馈表"""
    __tablename__ = "classification_feedbacks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, unique=True, index=True)
    original_category = Column(String(100), nullable=False)
    corrected_category = Column(String(100), nullable=False, index=True)
    feedback_text = Column(Text, nullable=True)
    user_id = Column(String(100), nullable=True)
    is_used_for_training = Column(Boolean, default=False)
    feedback_time = Column(DateTime, default=datetime.now, index=True)
    created_at = Column(DateTime, default=datetime.now)

    document = relationship("DocumentDB", back_populates="feedback")


class BatchTaskDB(Base):
    """批量处理任务表"""
    __tablename__ = "batch_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(100), nullable=False, unique=True, index=True)
    document_ids = Column(ARRAY(Integer), nullable=False)
    status = Column(String(50), default="pending", index=True)
    processed_count = Column(Integer, default=0)
    total_count = Column(Integer, nullable=False)
    failed_count = Column(Integer, default=0)
    priority = Column(Integer, default=0)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    error_details = Column(JSON, nullable=True)
    throughput = Column(Float, nullable=True)
    avg_processing_time = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class CacheEntryDB(Base):
    """缓存表 - 用于加速AI推理"""
    __tablename__ = "cache_entries"

    id = Column(Integer, primary_key=True, index=True)
    cache_key = Column(String(255), nullable=False, unique=True, index=True)
    cache_type = Column(String(50), nullable=False, index=True)
    value = Column(JSON, nullable=False)
    access_count = Column(Integer, default=0)
    last_accessed = Column(DateTime, default=datetime.now)
    expires_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.now)


class PerformanceMetricDB(Base):
    """性能指标表"""
    __tablename__ = "performance_metrics"

    id = Column(Integer, primary_key=True, index=True)
    metric_name = Column(String(100), nullable=False, index=True)
    metric_value = Column(Float, nullable=False)
    metric_unit = Column(String(20))
    operation = Column(String(100), index=True)
    document_id = Column(Integer, nullable=True)
    duration_ms = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=datetime.now, index=True)
    metadata = Column(JSON, nullable=True)


def init_db():
    """初始化数据库表"""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("数据库表初始化完成")
    except Exception as e:
        logger.error(f"数据库初始化失败: {str(e)}")
        raise


def get_db():
    """获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
