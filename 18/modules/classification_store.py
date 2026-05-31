import logging
import json
import re
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from sqlalchemy.orm import Session
import numpy as np
from config import settings
from .ai_client import ai_client
from .document_parser import document_parser
from database import (
    DocumentDB,
    DocumentContentDB,
    SemanticFeatureDB,
    HighlightInfoDB,
    ClassificationResultDB,
    BatchTaskDB,
)
from models import (
    DocumentCreate,
    DocumentContent,
    SemanticFeature,
    HighlightInfo,
    ClassificationResult,
    StoredDocument,
    ProcessStatus,
)
from .ai_cache import cached_classification

logger = logging.getLogger(__name__)


CATEGORY_RULES = {
    "合同协议": {
        "keywords": ["合同", "协议", "甲方", "乙方", "签订", "条款", "权利", "义务", "违约", "约定",
                     "合同期限", "履行", "解除", "终止", "争议解决", "管辖", "标的", "价款", "履行方式"],
        "patterns": [r"甲方.{0,10}乙方", r"乙方.{0,10}甲方", r"本合同.{0,10}约定", r"争议解决"],
        "weight": 2.0
    },
    "技术文档": {
        "keywords": ["系统", "架构", "设计", "实现", "接口", "模块", "算法", "代码", "技术", "功能",
                     "需求分析", "系统设计", "数据库", "API", "部署", "测试", "性能", "安全"],
        "patterns": [r"技术.{0,5}规范", r"系统.{0,5}架构", r"接口.{0,5}定义", r"数据结构"],
        "weight": 1.8
    },
    "财务报表": {
        "keywords": ["财务", "报表", "利润", "资产", "负债", "收入", "支出", "预算", "审计",
                     "损益", "现金", "股东权益", "净资产", "营业收入", "净利润", "成本", "费用"],
        "patterns": [r"人民币.{0,5}[万亿千百十]*[元角]", r"[0-9,]+元", r"资产负债表", r"利润表"],
        "weight": 2.2
    },
    "会议纪要": {
        "keywords": ["会议", "纪要", "讨论", "决议", "参会", "议程", "记录", "出席",
                     "会议时间", "会议地点", "主持人", "与会人员", "议题", "讨论事项"],
        "patterns": [r"会议纪要", r"时间.{0,5}地点", r"参加会议", r"会议决定"],
        "weight": 2.0
    },
    "项目报告": {
        "keywords": ["项目", "报告", "进度", "里程碑", "风险", "成果", "总结", "计划",
                     "项目背景", "项目目标", "项目范围", "项目计划", "项目预算", "项目进度"],
        "patterns": [r"项目.{0,5}报告", r"项目.{0,5}总结", r"项目.{0,5}进度"],
        "weight": 1.8
    },
    "规章制度": {
        "keywords": ["制度", "规定", "办法", "细则", "守则", "流程", "规范", "管理",
                     "总则", "适用范围", "职责", "考核", "奖惩", "附则"],
        "patterns": [r"第.{0,5}章.{0,5}第.{0,5}条", r"第.{0,5}条", r"本办法.{0,10}规定"],
        "weight": 2.0
    },
    "培训材料": {
        "keywords": ["培训", "教程", "学习", "课程", "手册", "指南", "教学", "知识点",
                     "培训目标", "培训内容", "培训方法", "考核方式", "学时", "学分"],
        "patterns": [r"培训.{0,5}大纲", r"学习.{0,5}目标", r"教学.{0,5}大纲"],
        "weight": 1.8
    }
}

FEW_SHOT_EXAMPLES = """
示例1:
文本: 甲方与乙方根据本协议约定，乙方需在2024年12月31日前完成系统开发工作。
分类结果: 合同协议

示例2:
文本: 本系统采用微服务架构设计，主要包含用户管理、权限管理、数据分析等核心模块。
分类结果: 技术文档

示例3:
文本: 2023年度公司实现营业收入1亿元，净利润2000万元，同比增长15%。
分类结果: 财务报表

示例4:
文本: 本次会议讨论了2024年第一季度工作计划，决定成立项目推进小组，由张总担任组长。
分类结果: 会议纪要

示例5:
文本: 本项目第一阶段已完成需求分析和系统设计，预计下月进入开发阶段。
分类结果: 项目报告

示例6:
文本: 第一章总则，第一条 为规范公司管理，特制定本办法。第二条 本办法适用于全体员工。
分类结果: 规章制度

示例7:
文本: 本课程主要讲解Python编程基础，包括变量、数据类型、条件语句、循环结构等内容。
分类结果: 培训材料
"""


class ClassificationStore:
    """分类存储模块（优化版）- 混合分类策略、多轮验证"""

    def __init__(self):
        self.categories = settings.DEFAULT_CATEGORIES
        self.classification_threshold = getattr(settings, 'CLASSIFICATION_THRESHOLD', 0.6)
        self.max_text_for_ai = getattr(settings, 'MAX_TEXT_FOR_AI', 8000)
        logger.info(
            f"分类存储模块初始化完成, 分类阈值: {self.classification_threshold}, "
            f"AI处理最大文本: {self.max_text_for_ai}字符"
        )

    def _calculate_rule_scores(
        self,
        text: str,
        keywords: List[str]
    ) -> Dict[str, float]:
        """计算基于规则的分类得分"""
        scores: Dict[str, float] = {}
        all_text = text + " " + " ".join(keywords) if keywords else text

        for category, rules in CATEGORY_RULES.items():
            score = 0.0

            for kw in rules["keywords"]:
                count = all_text.count(kw)
                if count > 0:
                    kw_weight = 2.0 if kw in keywords else 1.0
                    score += count * kw_weight * rules["weight"]

            for pattern in rules["patterns"]:
                matches = re.findall(pattern, all_text)
                score += len(matches) * 3.0 * rules["weight"]

            if score > 0:
                scores[category] = score

        return scores

    def _hybrid_classification(
        self,
        text: str,
        keywords: List[str],
        ai_result: Optional[Dict[str, Any]] = None
    ) -> ClassificationResult:
        """混合分类策略：规则 + AI"""
        rule_scores = self._calculate_rule_scores(text, keywords)

        if ai_result:
            ai_category = ai_result.get("primary_category", "其他")
            ai_confidence = float(ai_result.get("confidence", 0.5))
            ai_scores = ai_result.get("category_scores", {})

            if ai_category in self.categories:
                rule_scores[ai_category] = rule_scores.get(ai_category, 0) + ai_confidence * 10

            for cat, score in ai_scores.items():
                if cat in self.categories:
                    rule_scores[cat] = rule_scores.get(cat, 0) + score * 5

        if not rule_scores:
            return ClassificationResult(
                document_id=0,
                primary_category="其他",
                secondary_categories=[],
                confidence=0.5,
                category_scores={"其他": 1.0},
                classification_time=datetime.now()
            )

        total = sum(rule_scores.values())
        normalized_scores = {
            cat: round(score / total, 4)
            for cat, score in sorted(rule_scores.items(), key=lambda x: x[1], reverse=True)
        }

        primary_category = max(normalized_scores, key=normalized_scores.get)
        confidence = normalized_scores[primary_category]

        secondary_categories = [
            cat for cat, score in normalized_scores.items()
            if cat != primary_category and score > 0.1
        ][:3]

        return ClassificationResult(
            document_id=0,
            primary_category=primary_category,
            secondary_categories=secondary_categories,
            confidence=confidence,
            category_scores=normalized_scores,
            classification_time=datetime.now()
        )

    def save_highlights(self, db: Session, highlights: HighlightInfo) -> Optional[HighlightInfoDB]:
        """保存高亮信息"""
        try:
            db_highlights = HighlightInfoDB(
                document_id=highlights.document_id,
                key_paragraphs=highlights.key_paragraphs,
                key_sentences=highlights.key_sentences,
                important_terms=highlights.important_terms,
                title_highlights=highlights.title_highlights,
                confidence_scores=highlights.confidence_scores,
                extract_time=highlights.extract_time
            )
            db.add(db_highlights)
            db.commit()
            logger.info(f"保存高亮信息: 文档ID={highlights.document_id}")
            return db_highlights
        except Exception as e:
            logger.error(f"保存高亮信息失败: {str(e)}")
            db.rollback()
            return None

    @cached_classification
    async def classify_document(
        self,
        text: str,
        keywords: List[str],
        summary: Optional[str]
    ) -> Tuple[Optional[ClassificationResult], Optional[str]]:
        """AI智能分类（优化版：混合策略）"""
        try:
            text_for_ai = text[:self.max_text_for_ai] if text else ""

            context_parts = []
            if summary:
                context_parts.append(f"文档摘要: {summary}")
            if keywords:
                context_parts.append(f"文档关键词: {', '.join(keywords[:15])}")
            if text_for_ai:
                context_parts.append(f"文档内容片段:\n{text_for_ai}")

            context = "\n\n".join(context_parts)

            system_prompt = f"""你是专业的文档分类专家。请根据文档内容将其准确分类到以下类别之一:
{', '.join(self.categories)}

分类规则:
1. 仔细阅读文档内容，理解文档的核心主题和目的
2. 结合关键词和内容片段进行综合判断
3. 如果文档内容跨越多个类别，选择最主要的类别
4. 提供分类的置信度(0-1)，分值越高表示越确定
5. 给出每个类别的得分，用于交叉验证

以下是分类示例:
{FEW_SHOT_EXAMPLES}

请严格按照JSON格式返回结果。"""

            user_prompt = f"""请对以下文档进行分类:

{context}

返回格式:
{{
  "primary_category": "主分类名称",
  "secondary_categories": ["次要分类1", "次要分类2"],
  "confidence": 0.85,
  "category_scores": {{"类别1": 0.85, "类别2": 0.10, ...}}
}}"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]

            response, error = await ai_client.generate_chat_completion(
                messages, temperature=0.1, max_tokens=1500, response_format="json"
            )

            if error or not response:
                logger.warning(f"AI分类失败，使用混合规则分类: {error}")
                return self._hybrid_classification(text, keywords), None

            try:
                ai_result = json.loads(response)
                result = self._hybrid_classification(text, keywords, ai_result)
            except json.JSONDecodeError as e:
                logger.warning(f"AI响应解析失败，使用混合规则分类: {e}")
                result = self._hybrid_classification(text, keywords)

            if result.confidence < self.classification_threshold:
                logger.info(
                    f"分类置信度({result.confidence:.3f})低于阈值({self.classification_threshold}), "
                    f"标记为待人工审核"
                )
                result.primary_category = "其他"

            logger.info(
                f"分类完成: {result.primary_category}, "
                f"置信度: {result.confidence:.3f}, "
                f"次要分类: {result.secondary_categories}"
            )
            return result, None

        except Exception as e:
            error_msg = f"分类失败: {str(e)}"
            logger.error(error_msg)
            return self._hybrid_classification(text, keywords), None

    def _classify_rule_based(
        self,
        text: str,
        keywords: List[str]
    ) -> ClassificationResult:
        """基于规则的分类（ fallback 方法）"""
        return self._hybrid_classification(text, keywords)

    def create_document(self, db: Session, doc_create: DocumentCreate) -> DocumentDB:
        """创建文档记录"""
        db_doc = DocumentDB(
            filename=doc_create.filename,
            file_type=doc_create.file_type,
            file_size=doc_create.file_size,
            file_path=doc_create.file_path,
            status="pending"
        )
        db.add(db_doc)
        db.commit()
        db.refresh(db_doc)
        logger.info(f"创建文档记录: ID={db_doc.id}, 文件名={db_doc.filename}")
        return db_doc

    def save_document_content(self, db: Session, content: DocumentContent) -> Optional[DocumentContentDB]:
        """保存文档内容"""
        try:
            db_content = DocumentContentDB(
                document_id=content.document_id,
                raw_text=content.raw_text,
                cleaned_text=content.cleaned_text,
                page_count=content.page_count,
                metadata=content.metadata
            )
            db.add(db_content)

            db_doc = db.query(DocumentDB).filter(DocumentDB.id == content.document_id).first()
            if db_doc:
                db_doc.status = "parsed"
                db_doc.updated_at = datetime.now()

            db.commit()
            logger.info(f"保存文档内容: 文档ID={content.document_id}")
            return db_content
        except Exception as e:
            logger.error(f"保存文档内容失败: {str(e)}")
            db.rollback()
            return None

    def save_semantic_features(self, db: Session, features: SemanticFeature) -> Optional[SemanticFeatureDB]:
        """保存语义特征"""
        try:
            db_features = SemanticFeatureDB(
                document_id=features.document_id,
                keywords=features.keywords,
                summary=features.summary,
                topics=features.topics,
                entities=features.entities,
                embedding=features.embedding,
                sentiment=features.sentiment
            )
            db.add(db_features)
            db.commit()
            logger.info(f"保存语义特征: 文档ID={features.document_id}, 关键词数={len(features.keywords)}")
            return db_features
        except Exception as e:
            logger.error(f"保存语义特征失败: {str(e)}")
            db.rollback()
            return None

    def save_classification_result(self, db: Session, classification: ClassificationResult) -> Optional[ClassificationResultDB]:
        """保存分类结果"""
        try:
            db_classification = ClassificationResultDB(
                document_id=classification.document_id,
                primary_category=classification.primary_category,
                secondary_categories=classification.secondary_categories,
                confidence=classification.confidence,
                category_scores=classification.category_scores,
                classification_time=classification.classification_time
            )
            db.add(db_classification)

            db_doc = db.query(DocumentDB).filter(DocumentDB.id == classification.document_id).first()
            if db_doc:
                db_doc.status = "completed"
                db_doc.updated_at = datetime.now()

            db.commit()
            logger.info(f"保存分类结果: 文档ID={classification.document_id}, 分类={classification.primary_category}")
            return db_classification
        except Exception as e:
            logger.error(f"保存分类结果失败: {str(e)}")
            db.rollback()
            return None

    def update_document_status(
        self,
        db: Session,
        document_id: int,
        status: str,
        error_message: Optional[str] = None
    ) -> bool:
        """更新文档处理状态"""
        try:
            db_doc = db.query(DocumentDB).filter(DocumentDB.id == document_id).first()
            if db_doc:
                db_doc.status = status
                db_doc.error_message = error_message
                db_doc.updated_at = datetime.now()
                db.commit()
                return True
            return False
        except Exception as e:
            logger.error(f"更新文档状态失败: {str(e)}")
            db.rollback()
            return False

    def get_document(self, db: Session, document_id: int) -> Optional[StoredDocument]:
        """获取完整文档信息"""
        try:
            db_doc = db.query(DocumentDB).filter(DocumentDB.id == document_id).first()
            if not db_doc:
                return None

            return self._to_stored_document(db_doc)
        except Exception as e:
            logger.error(f"获取文档信息失败: {str(e)}")
            return None

    def list_documents(
        self,
        db: Session,
        skip: int = 0,
        limit: int = 100,
        category: Optional[str] = None,
        status: Optional[str] = None
    ) -> List[StoredDocument]:
        """获取文档列表"""
        try:
            query = db.query(DocumentDB)

            if category:
                query = query.join(ClassificationResultDB).filter(
                    ClassificationResultDB.primary_category == category
                )

            if status:
                query = query.filter(DocumentDB.status == status)

            db_docs = query.order_by(DocumentDB.upload_time.desc()).offset(skip).limit(limit).all()
            return [self._to_stored_document(doc) for doc in db_docs]
        except Exception as e:
            logger.error(f"获取文档列表失败: {str(e)}")
            return []

    def _to_stored_document(self, db_doc: DocumentDB) -> StoredDocument:
        """转换数据库模型为业务模型"""
        content = None
        if db_doc.content:
            content = DocumentContent(
                document_id=db_doc.id,
                raw_text=db_doc.content.raw_text,
                cleaned_text=db_doc.content.cleaned_text,
                page_count=db_doc.content.page_count,
                metadata=db_doc.content.metadata
            )

        semantic_features = None
        if db_doc.semantic_features:
            semantic_features = SemanticFeature(
                document_id=db_doc.id,
                keywords=db_doc.semantic_features.keywords or [],
                summary=db_doc.semantic_features.summary,
                topics=db_doc.semantic_features.topics or [],
                entities=db_doc.semantic_features.entities or [],
                embedding=db_doc.semantic_features.embedding,
                sentiment=db_doc.semantic_features.sentiment
            )

        classification = None
        if db_doc.classification:
            classification = ClassificationResult(
                document_id=db_doc.id,
                primary_category=db_doc.classification.primary_category,
                secondary_categories=db_doc.classification.secondary_categories or [],
                confidence=db_doc.classification.confidence,
                category_scores=db_doc.classification.category_scores or {},
                classification_time=db_doc.classification.classification_time
            )

        highlights = None
        if db_doc.highlights:
            highlights = HighlightInfo(
                document_id=db_doc.id,
                key_paragraphs=db_doc.highlights.key_paragraphs or [],
                key_sentences=db_doc.highlights.key_sentences or [],
                important_terms=db_doc.highlights.important_terms or [],
                title_highlights=db_doc.highlights.title_highlights or [],
                confidence_scores=db_doc.highlights.confidence_scores or {},
                extract_time=db_doc.highlights.extract_time
            )

        feedback = None
        if db_doc.feedback:
            from models import ClassificationFeedbackResponse
            feedback = ClassificationFeedbackResponse(
                id=db_doc.feedback.id,
                document_id=db_doc.id,
                original_category=db_doc.feedback.original_category,
                corrected_category=db_doc.feedback.corrected_category,
                feedback_text=db_doc.feedback.feedback_text,
                user_id=db_doc.feedback.user_id,
                is_used_for_training=db_doc.feedback.is_used_for_training,
                feedback_time=db_doc.feedback.feedback_time
            )

        from models import Document
        document_info = Document(
            id=db_doc.id,
            filename=db_doc.filename,
            file_type=db_doc.file_type,
            file_size=db_doc.file_size,
            file_path=db_doc.file_path,
            upload_time=db_doc.upload_time,
            status=db_doc.status,
            error_message=db_doc.error_message,
            priority=db_doc.priority
        )

        return StoredDocument(
            id=db_doc.id,
            document_info=document_info,
            content=content,
            semantic_features=semantic_features,
            highlights=highlights,
            classification=classification,
            feedback=feedback,
            created_at=db_doc.created_at,
            updated_at=db_doc.updated_at
        )

    def create_batch_task(
        self,
        db: Session,
        task_id: str,
        document_ids: List[int]
    ) -> BatchTaskDB:
        """创建批量处理任务"""
        db_task = BatchTaskDB(
            task_id=task_id,
            document_ids=document_ids,
            total_count=len(document_ids),
            status="pending"
        )
        db.add(db_task)
        db.commit()
        db.refresh(db_task)
        logger.info(f"创建批量处理任务: 任务ID={task_id}, 文档数={len(document_ids)}")
        return db_task

    def update_batch_task(
        self,
        db: Session,
        task_id: str,
        status: str,
        processed_count: Optional[int] = None,
        failed_count: Optional[int] = None,
        error_details: Optional[List[str]] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> bool:
        """更新批量任务状态"""
        try:
            db_task = db.query(BatchTaskDB).filter(BatchTaskDB.task_id == task_id).first()
            if not db_task:
                return False

            db_task.status = status
            if processed_count is not None:
                db_task.processed_count = processed_count
            if failed_count is not None:
                db_task.failed_count = failed_count
            if error_details is not None:
                db_task.error_details = error_details
            if start_time is not None:
                db_task.start_time = start_time
            if end_time is not None:
                db_task.end_time = end_time

            db.commit()
            return True
        except Exception as e:
            logger.error(f"更新批量任务失败: {str(e)}")
            db.rollback()
            return False

    def get_batch_task_status(self, db: Session, task_id: str) -> Optional[ProcessStatus]:
        """获取批量任务状态"""
        try:
            db_task = db.query(BatchTaskDB).filter(BatchTaskDB.task_id == task_id).first()
            if not db_task:
                return None

            return ProcessStatus(
                task_id=db_task.task_id,
                status=db_task.status,
                processed_count=db_task.processed_count,
                total_count=db_task.total_count,
                failed_count=db_task.failed_count,
                start_time=db_task.start_time,
                end_time=db_task.end_time,
                error_details=db_task.error_details or []
            )
        except Exception as e:
            logger.error(f"获取批量任务状态失败: {str(e)}")
            return None

    def semantic_search(
        self,
        db: Session,
        query_embedding: List[float],
        top_k: int = 10,
        categories: Optional[List[str]] = None
    ) -> List[Tuple[int, float]]:
        """语义搜索（基于向量相似度）"""
        try:
            query = db.query(
                SemanticFeatureDB.document_id,
                SemanticFeatureDB.embedding
            ).filter(SemanticFeatureDB.embedding.isnot(None))

            if categories:
                query = query.join(
                    ClassificationResultDB,
                    SemanticFeatureDB.document_id == ClassificationResultDB.document_id
                ).filter(
                    ClassificationResultDB.primary_category.in_(categories)
                )

            results = query.all()

            doc_scores = []
            query_vec = np.array(query_embedding)

            for doc_id, embedding in results:
                if embedding:
                    doc_vec = np.array(embedding)
                    similarity = float(np.dot(query_vec, doc_vec) / (
                        np.linalg.norm(query_vec) * np.linalg.norm(doc_vec)
                    ))
                    doc_scores.append((doc_id, similarity))

            doc_scores.sort(key=lambda x: x[1], reverse=True)
            return doc_scores[:top_k]

        except Exception as e:
            logger.error(f"语义搜索失败: {str(e)}")
            return []


classification_store = ClassificationStore()
