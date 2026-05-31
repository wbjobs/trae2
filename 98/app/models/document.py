from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer)
    file_type = Column(String(50))
    content = Column(Text)
    industry = Column(String(100))
    status = Column(String(50), default="uploaded")
    owner_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="documents")
    versions = relationship("DocumentVersion", back_populates="document", order_by="desc(DocumentVersion.version)")
    tasks = relationship("ProofreadTask", back_populates="document")


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    version = Column(Integer, default=1)
    file_path = Column(String(500), nullable=False)
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    description = Column(String(500))

    document = relationship("Document", back_populates="versions")
