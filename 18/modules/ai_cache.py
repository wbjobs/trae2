import logging
import hashlib
import json
import time
from typing import Optional, Any, Dict, List
from datetime import datetime, timedelta
from functools import wraps
from collections import OrderedDict
from dataclasses import dataclass, field

from sqlalchemy.orm import Session
from database import CacheEntryDB, SessionLocal

logger = logging.getLogger(__name__)


@dataclass
class CacheStats:
    """缓存统计信息"""
    hits: int = 0
    misses: int = 0
    total_requests: int = 0
    cache_size: int = 0


class AIMemoryCache:
    """内存LRU缓存 - 用于高频访问的AI推理结果"""

    def __init__(self, max_size: int = 1000, ttl: int = 3600):
        self.max_size = max_size
        self.ttl = ttl
        self._cache: OrderedDict[str, tuple] = OrderedDict()
        self._stats = CacheStats()
        logger.info(f"内存缓存初始化完成, 最大容量: {max_size}, TTL: {ttl}s")

    def _gen_key(self, prefix: str, content: str) -> str:
        """生成缓存键"""
        content_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
        return f"{prefix}:{content_hash}"

    def get(self, key: str) -> Optional[Any]:
        """获取缓存"""
        self._stats.total_requests += 1

        if key in self._cache:
            value, expire_time = self._cache[key]
            if time.time() < expire_time:
                self._stats.hits += 1
                self._cache.move_to_end(key)
                return value
            else:
                del self._cache[key]

        self._stats.misses += 1
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        """设置缓存"""
        if len(self._cache) >= self.max_size:
            self._cache.popitem(last=False)

        expire_time = time.time() + (ttl or self.ttl)
        self._cache[key] = (value, expire_time)
        self._stats.cache_size = len(self._cache)

    def clear_expired(self):
        """清理过期缓存"""
        expired_keys = []
        current_time = time.time()

        for key, (_, expire_time) in self._cache.items():
            if current_time >= expire_time:
                expired_keys.append(key)

        for key in expired_keys:
            del self._cache[key]

        logger.info(f"清理过期缓存: {len(expired_keys)}个")

    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        hit_rate = self._stats.hits / max(self._stats.total_requests, 1) * 100
        return {
            "hits": self._stats.hits,
            "misses": self._stats.misses,
            "total_requests": self._stats.total_requests,
            "hit_rate": f"{hit_rate:.2f}%",
            "cache_size": len(self._cache),
            "max_size": self.max_size
        }


class AICacheManager:
    """AI缓存管理器 - 双层缓存（内存+数据库）"""

    def __init__(self):
        self.memory_cache = AIMemoryCache(max_size=2000, ttl=7200)
        self.db_ttl = timedelta(days=7)
        self.enabled = True
        logger.info("AI缓存管理器初始化完成")

    def _hash_content(self, content: str) -> str:
        """计算内容哈希"""
        return hashlib.md5(content.encode('utf-8')).hexdigest()

    def get_embedding(self, text: str) -> Optional[List[float]]:
        """获取向量缓存"""
        if not self.enabled:
            return None

        key = f"emb:{self._hash_content(text[:500])}"
        result = self.memory_cache.get(key)
        if result is not None:
            return result

        db = SessionLocal()
        try:
            entry = db.query(CacheEntryDB).filter(
                CacheEntryDB.cache_key == key,
                CacheEntryDB.cache_type == "embedding",
                CacheEntryDB.expires_at > datetime.now()
            ).first()

            if entry:
                entry.access_count += 1
                entry.last_accessed = datetime.now()
                db.commit()
                self.memory_cache.set(key, entry.value)
                return entry.value
        finally:
            db.close()

        return None

    def set_embedding(self, text: str, embedding: List[float]):
        """设置向量缓存"""
        if not self.enabled:
            return

        key = f"emb:{self._hash_content(text[:500])}"
        self.memory_cache.set(key, embedding)

        db = SessionLocal()
        try:
            existing = db.query(CacheEntryDB).filter(CacheEntryDB.cache_key == key).first()
            if existing:
                existing.value = embedding
                existing.access_count += 1
                existing.last_accessed = datetime.now()
            else:
                db.add(CacheEntryDB(
                    cache_key=key,
                    cache_type="embedding",
                    value=embedding,
                    expires_at=datetime.now() + self.db_ttl
                ))
            db.commit()
        except Exception as e:
            logger.warning(f"保存向量缓存失败: {e}")
            db.rollback()
        finally:
            db.close()

    def get_classification(self, text: str, keywords: List[str]) -> Optional[Dict[str, Any]]:
        """获取分类缓存"""
        if not self.enabled:
            return None

        content = text[:1000] + "|" + ",".join(keywords[:10])
        key = f"cls:{self._hash_content(content)}"
        result = self.memory_cache.get(key)
        if result is not None:
            return result

        db = SessionLocal()
        try:
            entry = db.query(CacheEntryDB).filter(
                CacheEntryDB.cache_key == key,
                CacheEntryDB.cache_type == "classification",
                CacheEntryDB.expires_at > datetime.now()
            ).first()

            if entry:
                entry.access_count += 1
                entry.last_accessed = datetime.now()
                db.commit()
                self.memory_cache.set(key, entry.value)
                return entry.value
        finally:
            db.close()

        return None

    def set_classification(self, text: str, keywords: List[str], result: Dict[str, Any]):
        """设置分类缓存"""
        if not self.enabled:
            return

        content = text[:1000] + "|" + ",".join(keywords[:10])
        key = f"cls:{self._hash_content(content)}"
        self.memory_cache.set(key, result)

        db = SessionLocal()
        try:
            existing = db.query(CacheEntryDB).filter(CacheEntryDB.cache_key == key).first()
            if existing:
                existing.value = result
                existing.access_count += 1
                existing.last_accessed = datetime.now()
            else:
                db.add(CacheEntryDB(
                    cache_key=key,
                    cache_type="classification",
                    value=result,
                    expires_at=datetime.now() + self.db_ttl
                ))
            db.commit()
        except Exception as e:
            logger.warning(f"保存分类缓存失败: {e}")
            db.rollback()
        finally:
            db.close()

    def get_summary(self, text: str) -> Optional[str]:
        """获取摘要缓存"""
        if not self.enabled:
            return None

        key = f"sum:{self._hash_content(text[:1000])}"
        result = self.memory_cache.get(key)
        if result is not None:
            return result

        db = SessionLocal()
        try:
            entry = db.query(CacheEntryDB).filter(
                CacheEntryDB.cache_key == key,
                CacheEntryDB.cache_type == "summary",
                CacheEntryDB.expires_at > datetime.now()
            ).first()

            if entry:
                entry.access_count += 1
                entry.last_accessed = datetime.now()
                db.commit()
                self.memory_cache.set(key, entry.value)
                return entry.value
        finally:
            db.close()

        return None

    def set_summary(self, text: str, summary: str):
        """设置摘要缓存"""
        if not self.enabled:
            return

        key = f"sum:{self._hash_content(text[:1000])}"
        self.memory_cache.set(key, summary)

        db = SessionLocal()
        try:
            existing = db.query(CacheEntryDB).filter(CacheEntryDB.cache_key == key).first()
            if existing:
                existing.value = summary
                existing.access_count += 1
                existing.last_accessed = datetime.now()
            else:
                db.add(CacheEntryDB(
                    cache_key=key,
                    cache_type="summary",
                    value=summary,
                    expires_at=datetime.now() + self.db_ttl
                ))
            db.commit()
        except Exception as e:
            logger.warning(f"保存摘要缓存失败: {e}")
            db.rollback()
        finally:
            db.close()

    def clear_db_cache(self, older_than_days: int = 30):
        """清理数据库缓存"""
        db = SessionLocal()
        try:
            cutoff = datetime.now() - timedelta(days=older_than_days)
            deleted = db.query(CacheEntryDB).filter(
                (CacheEntryDB.expires_at < datetime.now()) |
                (CacheEntryDB.last_accessed < cutoff)
            ).delete()
            db.commit()
            logger.info(f"清理数据库缓存: {deleted}条")
        finally:
            db.close()

    def get_stats(self) -> Dict[str, Any]:
        """获取缓存统计"""
        db = SessionLocal()
        try:
            total_cache = db.query(CacheEntryDB).count()
            memory_stats = self.memory_cache.get_stats()

            return {
                "memory_cache": memory_stats,
                "db_cache_total": total_cache,
                "db_cache_ttl_days": self.db_ttl.days
            }
        finally:
            db.close()


ai_cache = AICacheManager()


def cached_embedding(func):
    """向量缓存装饰器"""
    @wraps(func)
    async def wrapper(text: str, *args, **kwargs):
        cached = ai_cache.get_embedding(text)
        if cached is not None:
            logger.debug("命中向量缓存")
            return cached, None

        result, error = await func(text, *args, **kwargs)
        if result is not None and error is None:
            ai_cache.set_embedding(text, result)
        return result, error
    return wrapper


def cached_classification(func):
    """分类缓存装饰器"""
    @wraps(func)
    async def wrapper(text: str, keywords: List[str], *args, **kwargs):
        cached = ai_cache.get_classification(text, keywords)
        if cached is not None:
            logger.debug("命中分类缓存")
            from models import ClassificationResult
            result = ClassificationResult(
                document_id=0,
                primary_category=cached["primary_category"],
                secondary_categories=cached.get("secondary_categories", []),
                confidence=cached["confidence"],
                category_scores=cached.get("category_scores", {})
            )
            return result, None

        result, error = await func(text, keywords, *args, **kwargs)
        if result is not None and error is None:
            ai_cache.set_classification(text, keywords, {
                "primary_category": result.primary_category,
                "secondary_categories": result.secondary_categories,
                "confidence": result.confidence,
                "category_scores": result.category_scores
            })
        return result, error
    return wrapper


def cached_summary(func):
    """摘要缓存装饰器"""
    @wraps(func)
    async def wrapper(text: str, *args, **kwargs):
        cached = ai_cache.get_summary(text)
        if cached is not None:
            logger.debug("命中摘要缓存")
            return cached

        result = await func(text, *args, **kwargs)
        if result is not None:
            ai_cache.set_summary(text, result)
        return result
    return wrapper
