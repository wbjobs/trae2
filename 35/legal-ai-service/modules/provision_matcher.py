import json
import os
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
import numpy as np
from loguru import logger
from config import settings
from .embedding_service import EmbeddingService, EmbeddingResult


@dataclass
class LegalProvision:
    provision_id: str
    law_name: str
    article_number: str
    article_title: str
    content: str
    category: str
    embedding: Optional[np.ndarray] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "provision_id": self.provision_id,
            "law_name": self.law_name,
            "article_number": self.article_number,
            "article_title": self.article_title,
            "content": self.content,
            "category": self.category,
        }


@dataclass
class MatchedProvision:
    provision: LegalProvision
    similarity_score: float
    matched_text: str
    match_type: str
    rank: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "provision": self.provision.to_dict(),
            "similarity_score": round(float(self.similarity_score), 4),
            "matched_text": self.matched_text,
            "match_type": self.match_type,
            "rank": self.rank,
        }


class ProvisionMatcher:
    _instance = None
    _provisions: List[LegalProvision] = []
    _provision_embeddings: Optional[np.ndarray] = None
    _provision_index: Dict[str, LegalProvision] = {}
    _embedding_service: Optional[EmbeddingService] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        self._embedding_service = EmbeddingService()
        self._load_provisions()
        logger.info(f"ProvisionMatcher initialized with {len(self._provisions)} provisions")

    def _load_provisions(self):
        provisions_path = settings.LEGAL_PROVISIONS_PATH
        if not os.path.exists(provisions_path):
            logger.warning(f"Provisions file not found: {provisions_path}, using sample data")
            self._provisions = self._create_sample_provisions()
        else:
            try:
                with open(provisions_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._provisions = [LegalProvision(**item) for item in data]
            except Exception as e:
                logger.error(f"Failed to load provisions: {e}")
                self._provisions = self._create_sample_provisions()

        self._provision_index = {p.provision_id: p for p in self._provisions}

    @staticmethod
    def _create_sample_provisions() -> List[LegalProvision]:
        return [
            LegalProvision(
                provision_id="law_001",
                law_name="中华人民共和国民法典",
                article_number="第五百七十七条",
                article_title="违约责任",
                content="当事人一方不履行合同义务或者履行合同义务不符合约定的，应当承担继续履行、采取补救措施或者赔偿损失等违约责任。",
                category="合同编",
            ),
            LegalProvision(
                provision_id="law_002",
                law_name="中华人民共和国民法典",
                article_number="第五百八十四条",
                article_title="赔偿损失范围",
                content="当事人一方不履行合同义务或者履行合同义务不符合约定，造成对方损失的，损失赔偿额应当相当于因违约所造成的损失，包括合同履行后可以获得的利益；但是，不得超过违约一方订立合同时预见到或者应当预见到的因违约可能造成的损失。",
                category="合同编",
            ),
            LegalProvision(
                provision_id="law_003",
                law_name="中华人民共和国民法典",
                article_number="第一千一百六十五条",
                article_title="过错责任原则",
                content="行为人因过错侵害他人民事权益造成损害的，应当承担侵权责任。依照法律规定推定行为人有过错，其不能证明自己没有过错的，应当承担侵权责任。",
                category="侵权责任编",
            ),
            LegalProvision(
                provision_id="law_004",
                law_name="中华人民共和国民法典",
                article_number="第一百八十八条",
                article_title="普通诉讼时效",
                content="向人民法院请求保护民事权利的诉讼时效期间为三年。法律另有规定的，依照其规定。诉讼时效期间自权利人知道或者应当知道权利受到损害以及义务人之日起计算。",
                category="总则编",
            ),
            LegalProvision(
                provision_id="law_005",
                law_name="中华人民共和国刑法",
                article_number="第二百六十六条",
                article_title="诈骗罪",
                content="诈骗公私财物，数额较大的，处三年以下有期徒刑、拘役或者管制，并处或者单处罚金；数额巨大或者有其他严重情节的，处三年以上十年以下有期徒刑，并处罚金；数额特别巨大或者有其他特别严重情节的，处十年以上有期徒刑或者无期徒刑，并处罚金或者没收财产。",
                category="侵犯财产罪",
            ),
            LegalProvision(
                provision_id="law_006",
                law_name="中华人民共和国劳动合同法",
                article_number="第四十六条",
                article_title="经济补偿",
                content="有下列情形之一的，用人单位应当向劳动者支付经济补偿：（一）劳动者依照本法第三十八条规定解除劳动合同的；（二）用人单位依照本法第三十六条规定向劳动者提出解除劳动合同并与劳动者协商一致解除劳动合同的；（三）用人单位依照本法第四十条规定解除劳动合同的。",
                category="劳动合同",
            ),
            LegalProvision(
                provision_id="law_007",
                law_name="中华人民共和国民法典",
                article_number="第五百零二条",
                article_title="合同生效时间",
                content="依法成立的合同，自成立时生效，但是法律另有规定或者当事人另有约定的除外。依照法律、行政法规的规定，合同应当办理批准等手续生效的，依照其规定。",
                category="合同编",
            ),
            LegalProvision(
                provision_id="law_008",
                law_name="中华人民共和国民法典",
                article_number="第五百六十三条",
                article_title="合同法定解除",
                content="有下列情形之一的，当事人可以解除合同：（一）因不可抗力致使不能实现合同目的；（二）在履行期限届满前，当事人一方明确表示或者以自己的行为表明不履行主要债务；（三）当事人一方迟延履行主要债务，经催告后在合理期限内仍未履行。",
                category="合同编",
            ),
        ]

    async def build_vector_index(self):
        if not self._provisions:
            logger.warning("No provisions to index")
            return

        logger.info("Building provision vector index...")
        provision_texts = []
        for prov in self._provisions:
            combined_text = f"{prov.law_name} {prov.article_number} {prov.article_title} {prov.content}"
            provision_texts.append(combined_text)

        embedding_results = await self._embedding_service.encode_batch(provision_texts)
        self._provision_embeddings = np.array(
            [r.embedding for r in embedding_results], dtype=np.float32
        )

        for i, result in enumerate(embedding_results):
            self._provisions[i].embedding = result.embedding

        logger.info(f"Vector index built for {len(self._provisions)} provisions")

    async def match_provisions(
        self,
        query_text: str,
        query_embedding: Optional[EmbeddingResult] = None,
        top_k: Optional[int] = None,
        threshold: Optional[float] = None,
    ) -> List[MatchedProvision]:
        if self._provision_embeddings is None:
            await self.build_vector_index()

        top_k = top_k or settings.TOP_K_PROVISIONS
        threshold = threshold or settings.SIMILARITY_THRESHOLD

        if query_embedding is None:
            query_embedding = await self._embedding_service.encode_text(query_text)

        similarities = np.dot(
            self._provision_embeddings,
            query_embedding.embedding.reshape(-1, 1),
        ).flatten()

        top_indices = np.argsort(similarities)[::-1][:top_k]

        matched_provisions = []
        for i, idx in enumerate(top_indices):
            score = float(similarities[idx])
            if score < threshold:
                continue

            provision = self._provisions[idx]
            match_type = self._determine_match_type(query_text, provision.content)

            matched_provisions.append(
                MatchedProvision(
                    provision=provision,
                    similarity_score=score,
                    matched_text=self._extract_matched_segment(query_text, provision.content),
                    match_type=match_type,
                    rank=i + 1,
                )
            )

        logger.info(f"Found {len(matched_provisions)} matched provisions")
        return matched_provisions

    async def match_by_paragraphs(
        self,
        paragraphs: List[str],
        paragraph_embeddings: Optional[List[EmbeddingResult]] = None,
        top_k: Optional[int] = None,
    ) -> List[MatchedProvision]:
        if paragraph_embeddings is None:
            paragraph_embeddings = await self._embedding_service.encode_paragraphs(paragraphs)

        all_matches = []
        for para_embedding in paragraph_embeddings:
            para_matches = await self.match_provisions(
                query_text=para_embedding.text,
                query_embedding=para_embedding,
                top_k=min(5, top_k or 5),
            )
            all_matches.extend(para_matches)

        merged_matches = self._merge_and_rerank(all_matches)
        return merged_matches[: top_k or settings.TOP_K_PROVISIONS]

    def _merge_and_rerank(self, matches: List[MatchedProvision]) -> List[MatchedProvision]:
        provision_scores: Dict[str, Dict[str, Any]] = {}

        for match in matches:
            prov_id = match.provision.provision_id
            if prov_id not in provision_scores:
                provision_scores[prov_id] = {
                    "provision": match.provision,
                    "max_score": match.similarity_score,
                    "avg_score": match.similarity_score,
                    "count": 1,
                    "matched_texts": [match.matched_text],
                    "match_types": {match.match_type},
                }
            else:
                entry = provision_scores[prov_id]
                entry["max_score"] = max(entry["max_score"], match.similarity_score)
                entry["avg_score"] = (
                    (entry["avg_score"] * entry["count"] + match.similarity_score)
                    / (entry["count"] + 1)
                )
                entry["count"] += 1
                entry["matched_texts"].append(match.matched_text)
                entry["match_types"].add(match.match_type)

        merged: List[MatchedProvision] = []
        for prov_id, entry in provision_scores.items():
            combined_score = entry["max_score"] * 0.6 + entry["avg_score"] * 0.4
            if entry["count"] > 1:
                combined_score += 0.05 * min(entry["count"] - 1, 5)

            merged.append(
                MatchedProvision(
                    provision=entry["provision"],
                    similarity_score=combined_score,
                    matched_text=" | ".join(entry["matched_texts"][:3]),
                    match_type=",".join(entry["match_types"]),
                )
            )

        merged.sort(key=lambda x: x.similarity_score, reverse=True)
        for i, m in enumerate(merged):
            m.rank = i + 1

        return merged

    @staticmethod
    def _determine_match_type(query_text: str, provision_content: str) -> str:
        import jieba

        query_words = set(jieba.lcut(query_text))
        provision_words = set(jieba.lcut(provision_content))

        intersection = query_words & provision_words
        if len(intersection) > min(len(query_words) * 0.5, 10):
            return "高相关"
        elif len(intersection) > min(len(query_words) * 0.3, 5):
            return "中相关"
        else:
            return "语义匹配"

    @staticmethod
    def _extract_matched_segment(query_text: str, provision_content: str, max_len: int = 100) -> str:
        import jieba

        query_words = set(jieba.lcut(query_text))

        sentences = [s.strip() for s in provision_content.split("。") if s.strip()]
        best_sentence = ""
        best_match = 0

        for sentence in sentences:
            sent_words = set(jieba.lcut(sentence))
            match_count = len(query_words & sent_words)
            if match_count > best_match:
                best_match = match_count
                best_sentence = sentence

        if best_sentence:
            return best_sentence[:max_len] + "..." if len(best_sentence) > max_len else best_sentence
        return provision_content[:max_len] + "..."

    def get_provision_by_id(self, provision_id: str) -> Optional[LegalProvision]:
        return self._provision_index.get(provision_id)

    def get_all_provisions(self) -> List[LegalProvision]:
        return self._provisions.copy()

    def get_provisions_by_category(self, category: str) -> List[LegalProvision]:
        return [p for p in self._provisions if p.category == category]
