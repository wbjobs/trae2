import logging
import json
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from collections import defaultdict
from sqlalchemy.orm import Session
from database import ClassificationFeedbackDB, ClassificationResultDB, DocumentDB
from models import ClassificationFeedback, ClassificationFeedbackResponse

logger = logging.getLogger(__name__)


class FeedbackSystem:
    """分类反馈系统 - 处理人工纠错、积累训练数据、动态调整分类策略"""

    def __init__(self):
        self.feedback_threshold = 10
        self.retraining_trigger = 50
        logger.info("分类反馈系统初始化完成")

    def submit_feedback(
        self,
        db: Session,
        feedback: ClassificationFeedback
    ) -> Optional[ClassificationFeedbackResponse]:
        """提交分类反馈"""
        try:
            existing = db.query(ClassificationFeedbackDB).filter(
                ClassificationFeedbackDB.document_id == feedback.document_id
            ).first()

            if existing:
                existing.original_category = feedback.original_category
                existing.corrected_category = feedback.corrected_category
                existing.feedback_text = feedback.feedback_text
                existing.user_id = feedback.user_id
                existing.feedback_time = datetime.now()
                existing.is_used_for_training = False
                feedback_db = existing
                logger.info(f"更新已有反馈: 文档ID={feedback.document_id}")
            else:
                feedback_db = ClassificationFeedbackDB(
                    document_id=feedback.document_id,
                    original_category=feedback.original_category,
                    corrected_category=feedback.corrected_category,
                    feedback_text=feedback.feedback_text,
                    user_id=feedback.user_id
                )
                db.add(feedback_db)
                logger.info(f"创建新反馈: 文档ID={feedback.document_id}")

            classification = db.query(ClassificationResultDB).filter(
                ClassificationResultDB.document_id == feedback.document_id
            ).first()
            if classification:
                classification.primary_category = feedback.corrected_category
                classification.confidence = 1.0

            doc = db.query(DocumentDB).filter(DocumentDB.id == feedback.document_id).first()
            if doc:
                doc.updated_at = datetime.now()

            db.commit()
            db.refresh(feedback_db)

            logger.info(
                f"反馈提交成功: 文档ID={feedback.document_id}, "
                f"原始分类={feedback.original_category}, "
                f"修正分类={feedback.corrected_category}"
            )

            return ClassificationFeedbackResponse(
                id=feedback_db.id,
                document_id=feedback_db.document_id,
                original_category=feedback_db.original_category,
                corrected_category=feedback_db.corrected_category,
                feedback_text=feedback_db.feedback_text,
                user_id=feedback_db.user_id,
                is_used_for_training=feedback_db.is_used_for_training,
                feedback_time=feedback_db.feedback_time
            )

        except Exception as e:
            logger.error(f"提交反馈失败: {str(e)}")
            db.rollback()
            return None

    def get_document_feedback(
        self,
        db: Session,
        document_id: int
    ) -> Optional[ClassificationFeedbackResponse]:
        """获取文档的反馈"""
        try:
            feedback = db.query(ClassificationFeedbackDB).filter(
                ClassificationFeedbackDB.document_id == document_id
            ).first()

            if not feedback:
                return None

            return ClassificationFeedbackResponse(
                id=feedback.id,
                document_id=feedback.document_id,
                original_category=feedback.original_category,
                corrected_category=feedback.corrected_category,
                feedback_text=feedback.feedback_text,
                user_id=feedback.user_id,
                is_used_for_training=feedback.is_used_for_training,
                feedback_time=feedback.feedback_time
            )

        except Exception as e:
            logger.error(f"获取文档反馈失败: {str(e)}")
            return None

    def get_all_feedback(
        self,
        db: Session,
        skip: int = 0,
        limit: int = 100,
        only_unused: bool = False
    ) -> List[ClassificationFeedbackResponse]:
        """获取所有反馈"""
        try:
            query = db.query(ClassificationFeedbackDB)

            if only_unused:
                query = query.filter(ClassificationFeedbackDB.is_used_for_training == False)

            feedback_list = query.order_by(
                ClassificationFeedbackDB.feedback_time.desc()
            ).offset(skip).limit(limit).all()

            return [
                ClassificationFeedbackResponse(
                    id=f.id,
                    document_id=f.document_id,
                    original_category=f.original_category,
                    corrected_category=f.corrected_category,
                    feedback_text=f.feedback_text,
                    user_id=f.user_id,
                    is_used_for_training=f.is_used_for_training,
                    feedback_time=f.feedback_time
                )
                for f in feedback_list
            ]

        except Exception as e:
            logger.error(f"获取反馈列表失败: {str(e)}")
            return []

    def get_feedback_statistics(self, db: Session) -> Dict[str, Any]:
        """获取反馈统计信息"""
        try:
            total_feedback = db.query(ClassificationFeedbackDB).count()
            unused_feedback = db.query(ClassificationFeedbackDB).filter(
                ClassificationFeedbackDB.is_used_for_training == False
            ).count()

            category_corrections = defaultdict(lambda: defaultdict(int))
            feedbacks = db.query(ClassificationFeedbackDB).all()

            for f in feedbacks:
                category_corrections[f.original_category][f.corrected_category] += 1

            corrections_dict = {
                orig: dict(corr)
                for orig, corr in category_corrections.items()
            }

            return {
                "total_feedback": total_feedback,
                "unused_for_training": unused_feedback,
                "category_corrections": corrections_dict,
                "needs_retraining": unused_feedback >= self.retraining_trigger
            }

        except Exception as e:
            logger.error(f"获取反馈统计失败: {str(e)}")
            return {}

    def mark_as_used(self, db: Session, feedback_ids: List[int]) -> int:
        """标记反馈为已用于训练"""
        try:
            updated = db.query(ClassificationFeedbackDB).filter(
                ClassificationFeedbackDB.id.in_(feedback_ids)
            ).update({"is_used_for_training": True})
            db.commit()
            logger.info(f"标记{updated}条反馈为已用于训练")
            return updated
        except Exception as e:
            logger.error(f"标记反馈失败: {str(e)}")
            db.rollback()
            return 0

    def get_training_data(self, db: Session, limit: int = 1000) -> List[Dict[str, Any]]:
        """获取训练数据（用于微调模型）"""
        try:
            from database import DocumentContentDB

            training_data = []

            feedbacks = db.query(ClassificationFeedbackDB).filter(
                ClassificationFeedbackDB.is_used_for_training == False
            ).limit(limit).all()

            for f in feedbacks:
                content = db.query(DocumentContentDB).filter(
                    DocumentContentDB.document_id == f.document_id
                ).first()

                if content:
                    training_data.append({
                        "document_id": f.document_id,
                        "text": content.cleaned_text or content.raw_text,
                        "original_category": f.original_category,
                        "corrected_category": f.corrected_category,
                        "feedback_text": f.feedback_text
                    })

            logger.info(f"获取{len(training_data)}条训练数据")
            return training_data

        except Exception as e:
            logger.error(f"获取训练数据失败: {str(e)}")
            return []

    def generate_finetune_prompt(self, db: Session, limit: int = 100) -> str:
        """生成微调提示词（few-shot示例）"""
        training_data = self.get_training_data(db, limit)

        if not training_data:
            return ""

        examples = []
        for item in training_data[:20]:
            text_snippet = item["text"][:500] + "..." if len(item["text"]) > 500 else item["text"]
            examples.append(
                f"文本: {text_snippet}\n"
                f"原始分类: {item['original_category']}\n"
                f"正确分类: {item['corrected_category']}\n"
            )

        prompt = "以下是人工修正的分类示例，请参考这些示例改进分类准确性：\n\n" + "\n".join(examples)

        logger.info(f"生成微调提示词，包含{len(examples)}个示例")
        return prompt

    def get_confusion_matrix(self, db: Session, categories: List[str]) -> Dict[str, Dict[str, int]]:
        """获取混淆矩阵"""
        try:
            matrix = {cat: {cat2: 0 for cat2 in categories} for cat in categories}

            feedbacks = db.query(ClassificationFeedbackDB).all()

            for f in feedbacks:
                if f.original_category in matrix and f.corrected_category in matrix:
                    matrix[f.original_category][f.corrected_category] += 1

            return matrix

        except Exception as e:
            logger.error(f"获取混淆矩阵失败: {str(e)}")
            return {}

    def suggest_rule_adjustments(self, db: Session) -> List[Dict[str, Any]]:
        """根据反馈建议规则调整"""
        try:
            stats = self.get_feedback_statistics(db)
            corrections = stats.get("category_corrections", {})
            suggestions = []

            for original, target_dict in corrections.items():
                if not target_dict:
                    continue

                most_common = max(target_dict.items(), key=lambda x: x[1])
                if most_common[1] >= self.feedback_threshold:
                    suggestions.append({
                        "from_category": original,
                        "to_category": most_common[0],
                        "correction_count": most_common[1],
                        "suggestion": f"建议检查'{original}'分类规则，有{most_common[1]}次被修正为'{most_common[0]}'"
                    })

            logger.info(f"生成{len(suggestions)}条规则调整建议")
            return suggestions

        except Exception as e:
            logger.error(f"生成规则调整建议失败: {str(e)}")
            return []


feedback_system = FeedbackSystem()
