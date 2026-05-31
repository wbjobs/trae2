import json
import os
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid

from loguru import logger
from sqlalchemy import (
    create_engine, Column, String, Integer, Text, DateTime, Boolean, JSON, Float, ForeignKey
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

from config import settings
from modules.provision_matcher import ProvisionMatcher, MatchedProvision


Base = declarative_base()


class CorrectionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"


class ProvisionCorrection(Base):
    __tablename__ = "provision_corrections"

    id = Column(String, primary_key=True)
    document_id = Column(String, index=True, nullable=False)
    original_provision_id = Column(String, nullable=False)
    original_law_name = Column(String, nullable=False)
    original_article_number = Column(String, nullable=False)
    original_similarity_score = Column(Float)

    corrected_provision_id = Column(String)
    corrected_law_name = Column(String)
    corrected_article_number = Column(String)
    corrected_content = Column(Text)

    status = Column(String, default=CorrectionStatus.PENDING.value)
    feedback_comment = Column(Text)
    correction_reason = Column(Text)

    submitted_by = Column(String)
    reviewed_by = Column(String)
    reviewed_at = Column(DateTime)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    is_active = Column(Boolean, default=True)
    metadata = Column(JSON, default={})


@dataclass
class CorrectionRequest:
    document_id: str
    original_provision_id: str
    corrected_provision_id: Optional[str] = None
    corrected_law_name: Optional[str] = None
    corrected_article_number: Optional[str] = None
    corrected_content: Optional[str] = None
    correction_reason: Optional[str] = None
    submitted_by: Optional[str] = None
    feedback_comment: Optional[str] = None


@dataclass
class CorrectionFeedback:
    correction_id: str
    status: CorrectionStatus
    reviewer: Optional[str] = None
    review_comment: Optional[str] = None


class ProvisionCorrectionManager:
    _instance = None
    _engine = None
    _SessionLocal = None
    _provision_matcher: Optional[ProvisionMatcher] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        self._db_url = os.getenv("DATABASE_URL", "sqlite:///data/corrections.db")
        self._engine = create_engine(self._db_url, connect_args={"check_same_thread": False})
        self._SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self._engine)
        Base.metadata.create_all(bind=self._engine)
        self._provision_matcher = ProvisionMatcher()
        logger.info("ProvisionCorrectionManager initialized")

    def _get_session(self):
        return self._SessionLocal()

    async def submit_correction(
        self,
        request: CorrectionRequest,
    ) -> Dict[str, Any]:
        session = self._get_session()
        try:
            original_provision = None
            if request.original_provision_id:
                original_provision = self._provision_matcher.get_provision_by_id(
                    request.original_provision_id
                )

            correction = ProvisionCorrection(
                id=f"corr_{uuid.uuid4().hex[:16]}",
                document_id=request.document_id,
                original_provision_id=request.original_provision_id,
                original_law_name=original_provision.law_name if original_provision else "",
                original_article_number=original_provision.article_number if original_provision else "",
                corrected_provision_id=request.corrected_provision_id,
                corrected_law_name=request.corrected_law_name,
                corrected_article_number=request.corrected_article_number,
                corrected_content=request.corrected_content,
                correction_reason=request.correction_reason,
                submitted_by=request.submitted_by,
                feedback_comment=request.feedback_comment,
                status=CorrectionStatus.PENDING.value,
            )

            session.add(correction)
            session.commit()

            logger.info(
                f"Correction submitted: id={correction.id}, "
                f"document={request.document_id}, "
                f"provision={request.original_provision_id}"
            )

            return {
                "correction_id": correction.id,
                "status": correction.status,
                "created_at": correction.created_at.isoformat(),
            }

        except Exception as e:
            session.rollback()
            logger.error(f"Failed to submit correction: {e}")
            raise
        finally:
            session.close()

    async def review_correction(
        self,
        feedback: CorrectionFeedback,
    ) -> Dict[str, Any]:
        session = self._get_session()
        try:
            correction = session.query(ProvisionCorrection).filter(
                ProvisionCorrection.id == feedback.correction_id
            ).first()

            if not correction:
                raise ValueError(f"Correction not found: {feedback.correction_id}")

            if feedback.status == CorrectionStatus.APPROVED:
                session.query(ProvisionCorrection).filter(
                    ProvisionCorrection.document_id == correction.document_id,
                    ProvisionCorrection.original_provision_id == correction.original_provision_id,
                    ProvisionCorrection.id != feedback.correction_id,
                    ProvisionCorrection.status == CorrectionStatus.APPROVED.value,
                ).update({"status": CorrectionStatus.SUPERSEDED.value, "is_active": False})

            correction.status = feedback.status.value
            correction.reviewed_by = feedback.reviewer
            correction.reviewed_at = datetime.utcnow()
            correction.updated_at = datetime.utcnow()

            if feedback.review_comment:
                correction.metadata["review_comment"] = feedback.review_comment

            session.commit()

            logger.info(
                f"Correction reviewed: id={feedback.correction_id}, "
                f"status={feedback.status.value}"
            )

            return {
                "correction_id": correction.id,
                "status": correction.status,
                "reviewed_at": correction.reviewed_at.isoformat(),
            }

        except Exception as e:
            session.rollback()
            logger.error(f"Failed to review correction: {e}")
            raise
        finally:
            session.close()

    def get_corrections(
        self,
        document_id: Optional[str] = None,
        status: Optional[CorrectionStatus] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        session = self._get_session()
        try:
            query = session.query(ProvisionCorrection)

            if document_id:
                query = query.filter(ProvisionCorrection.document_id == document_id)
            if status:
                query = query.filter(ProvisionCorrection.status == status.value)

            query = query.order_by(ProvisionCorrection.created_at.desc())
            corrections = query.offset(skip).limit(limit).all()

            return [self._correction_to_dict(c) for c in corrections]

        finally:
            session.close()

    def get_approved_corrections(
        self,
        document_id: str,
    ) -> List[Dict[str, Any]]:
        return self.get_corrections(
            document_id=document_id,
            status=CorrectionStatus.APPROVED,
        )

    def apply_corrections_to_result(
        self,
        matched_provisions: List[MatchedProvision],
        document_id: str,
    ) -> List[MatchedProvision]:
        approved_corrections = self.get_approved_corrections(document_id)
        if not approved_corrections:
            return matched_provisions

        correction_map = {}
        for corr in approved_corrections:
            correction_map[corr["original_provision_id"]] = corr

        result = []
        for prov in matched_provisions:
            if prov.provision.provision_id in correction_map:
                corr = correction_map[prov.provision.provision_id]
                if corr.get("corrected_provision_id"):
                    corrected_prov = self._provision_matcher.get_provision_by_id(
                        corr["corrected_provision_id"]
                    )
                    if corrected_prov:
                        result.append(
                            MatchedProvision(
                                provision=corrected_prov,
                                similarity_score=prov.similarity_score,
                                matched_text=corr.get("corrected_content", prov.matched_text),
                                match_type="人工校正",
                                rank=prov.rank,
                            )
                        )
                        continue
            result.append(prov)

        logger.info(f"Applied {len(correction_map)} corrections to document {document_id}")
        return result

    def get_correction_statistics(self) -> Dict[str, Any]:
        session = self._get_session()
        try:
            total = session.query(ProvisionCorrection).count()
            pending = session.query(ProvisionCorrection).filter(
                ProvisionCorrection.status == CorrectionStatus.PENDING.value
            ).count()
            approved = session.query(ProvisionCorrection).filter(
                ProvisionCorrection.status == CorrectionStatus.APPROVED.value
            ).count()
            rejected = session.query(ProvisionCorrection).filter(
                ProvisionCorrection.status == CorrectionStatus.REJECTED.value
            ).count()

            return {
                "total_corrections": total,
                "pending": pending,
                "approved": approved,
                "rejected": rejected,
                "approval_rate": approved / total if total > 0 else 0,
            }

        finally:
            session.close()

    def delete_correction(self, correction_id: str) -> bool:
        session = self._get_session()
        try:
            correction = session.query(ProvisionCorrection).filter(
                ProvisionCorrection.id == correction_id
            ).first()
            if correction:
                session.delete(correction)
                session.commit()
                return True
            return False
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to delete correction: {e}")
            return False
        finally:
            session.close()

    @staticmethod
    def _correction_to_dict(correction: ProvisionCorrection) -> Dict[str, Any]:
        return {
            "id": correction.id,
            "document_id": correction.document_id,
            "original_provision_id": correction.original_provision_id,
            "original_law_name": correction.original_law_name,
            "original_article_number": correction.original_article_number,
            "original_similarity_score": correction.original_similarity_score,
            "corrected_provision_id": correction.corrected_provision_id,
            "corrected_law_name": correction.corrected_law_name,
            "corrected_article_number": correction.corrected_article_number,
            "corrected_content": correction.corrected_content,
            "status": correction.status,
            "correction_reason": correction.correction_reason,
            "feedback_comment": correction.feedback_comment,
            "submitted_by": correction.submitted_by,
            "reviewed_by": correction.reviewed_by,
            "reviewed_at": correction.reviewed_at.isoformat() if correction.reviewed_at else None,
            "created_at": correction.created_at.isoformat(),
            "updated_at": correction.updated_at.isoformat(),
            "is_active": correction.is_active,
            "metadata": correction.metadata,
        }
