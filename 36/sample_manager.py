"""
样本库管理模块
提供声学样本的 CRUD 操作、特征存储、分类结果管理
"""
import json
import logging
import sqlite3
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from config import (
    SAMPLE_DB_PATH,
    SAMPLE_STORAGE_DIR,
    SAMPLE_RATE,
    TABLE_SAMPLES,
    TABLE_SAMPLE_FEATURES,
    TABLE_CLASSIFICATION_RESULTS,
)

logger = logging.getLogger(__name__)


class SampleDatabase:
    _instance: Optional["SampleDatabase"] = None

    def __new__(cls, db_path: Optional[str] = None):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, db_path: Optional[str] = None):
        if self._initialized:
            return
        self.db_path = Path(db_path or SAMPLE_DB_PATH)
        self.db_path.parent.mkdir(exist_ok=True, parents=True)
        self._conn = None
        self._initialize_tables()
        self._initialized = True

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(str(self.db_path))
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
        return self._conn

    def _initialize_tables(self):
        conn = self._get_conn()
        conn.executescript(f"""
            CREATE TABLE IF NOT EXISTS {TABLE_SAMPLES} (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                file_path TEXT,
                source_type TEXT NOT NULL DEFAULT 'file_upload',
                source_id TEXT,
                duration REAL NOT NULL DEFAULT 0.0,
                sample_rate INTEGER NOT NULL DEFAULT {SAMPLE_RATE},
                channels INTEGER NOT NULL DEFAULT 1,
                file_size INTEGER NOT NULL DEFAULT 0,
                label TEXT,
                category TEXT,
                tags TEXT,
                metadata TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                is_deleted INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_samples_label ON {TABLE_SAMPLES}(label);
            CREATE INDEX IF NOT EXISTS idx_samples_category ON {TABLE_SAMPLES}(category);
            CREATE INDEX IF NOT EXISTS idx_samples_created_at ON {TABLE_SAMPLES}(created_at);
            CREATE INDEX IF NOT EXISTS idx_samples_source_type ON {TABLE_SAMPLES}(source_type);

            CREATE TABLE IF NOT EXISTS {TABLE_SAMPLE_FEATURES} (
                id TEXT PRIMARY KEY,
                sample_id TEXT NOT NULL,
                feature_type TEXT NOT NULL,
                feature_data BLOB,
                feature_shape TEXT,
                feature_dim INTEGER,
                metadata TEXT,
                created_at REAL NOT NULL,
                FOREIGN KEY (sample_id) REFERENCES {TABLE_SAMPLES}(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_features_sample_id ON {TABLE_SAMPLE_FEATURES}(sample_id);
            CREATE INDEX IF NOT EXISTS idx_features_feature_type ON {TABLE_SAMPLE_FEATURES}(feature_type);

            CREATE TABLE IF NOT EXISTS {TABLE_CLASSIFICATION_RESULTS} (
                id TEXT PRIMARY KEY,
                sample_id TEXT NOT NULL,
                predicted_label TEXT NOT NULL,
                confidence REAL NOT NULL DEFAULT 0.0,
                probabilities TEXT,
                model_type TEXT,
                model_version TEXT,
                latency_ms REAL,
                feature_data BLOB,
                created_at REAL NOT NULL,
                FOREIGN KEY (sample_id) REFERENCES {TABLE_SAMPLES}(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_results_sample_id ON {TABLE_CLASSIFICATION_RESULTS}(sample_id);
            CREATE INDEX IF NOT EXISTS idx_results_predicted_label ON {TABLE_CLASSIFICATION_RESULTS}(predicted_label);
            CREATE INDEX IF NOT EXISTS idx_results_created_at ON {TABLE_CLASSIFICATION_RESULTS}(created_at);
        """)
        conn.commit()
        logger.info("Database tables initialized")

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None


class SampleRecord:
    def __init__(
        self,
        id: Optional[str] = None,
        filename: str = "",
        file_path: Optional[str] = None,
        source_type: str = "file_upload",
        source_id: Optional[str] = None,
        duration: float = 0.0,
        sample_rate: int = SAMPLE_RATE,
        channels: int = 1,
        file_size: int = 0,
        label: Optional[str] = None,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict] = None,
        created_at: Optional[float] = None,
        updated_at: Optional[float] = None,
    ):
        self.id = id or str(uuid.uuid4())
        self.filename = filename
        self.file_path = file_path
        self.source_type = source_type
        self.source_id = source_id
        self.duration = duration
        self.sample_rate = sample_rate
        self.channels = channels
        self.file_size = file_size
        self.label = label
        self.category = category
        self.tags = tags or []
        self.metadata = metadata or {}
        now = time.time()
        self.created_at = created_at or now
        self.updated_at = updated_at or now

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "filename": self.filename,
            "file_path": self.file_path,
            "source_type": self.source_type,
            "source_id": self.source_id,
            "duration": self.duration,
            "sample_rate": self.sample_rate,
            "channels": self.channels,
            "file_size": self.file_size,
            "label": self.label,
            "category": self.category,
            "tags": self.tags,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "created_at_str": datetime.fromtimestamp(self.created_at).isoformat(),
        }

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "SampleRecord":
        return cls(
            id=row["id"],
            filename=row["filename"],
            file_path=row["file_path"],
            source_type=row["source_type"],
            source_id=row["source_id"],
            duration=row["duration"],
            sample_rate=row["sample_rate"],
            channels=row["channels"],
            file_size=row["file_size"],
            label=row["label"],
            category=row["category"],
            tags=json.loads(row["tags"]) if row["tags"] else [],
            metadata=json.loads(row["metadata"]) if row["metadata"] else {},
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


class SampleManager:
    def __init__(self, db: Optional[SampleDatabase] = None):
        self.db = db or SampleDatabase()
        self.storage_dir = Path(SAMPLE_STORAGE_DIR)
        self.storage_dir.mkdir(exist_ok=True, parents=True)

    def add_sample(
        self,
        filename: str,
        audio_data: Optional[np.ndarray] = None,
        file_path: Optional[str] = None,
        source_type: str = "file_upload",
        source_id: Optional[str] = None,
        duration: float = 0.0,
        sample_rate: int = SAMPLE_RATE,
        channels: int = 1,
        label: Optional[str] = None,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict] = None,
    ) -> SampleRecord:
        record = SampleRecord(
            filename=filename,
            file_path=file_path,
            source_type=source_type,
            source_id=source_id,
            duration=duration,
            sample_rate=sample_rate,
            channels=channels,
            label=label,
            category=category,
            tags=tags,
            metadata=metadata,
        )

        if audio_data is not None and file_path is None:
            record.file_path = self._save_audio_file(record.id, filename, audio_data, sample_rate)
            record.file_size = Path(record.file_path).stat().st_size
        elif file_path and Path(file_path).exists():
            record.file_size = Path(file_path).stat().st_size

        conn = self.db._get_conn()
        conn.execute(
            f"""
            INSERT OR REPLACE INTO {TABLE_SAMPLES}
            (id, filename, file_path, source_type, source_id, duration, sample_rate,
             channels, file_size, label, category, tags, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.id,
                record.filename,
                record.file_path,
                record.source_type,
                record.source_id,
                record.duration,
                record.sample_rate,
                record.channels,
                record.file_size,
                record.label,
                record.category,
                json.dumps(record.tags, ensure_ascii=False),
                json.dumps(record.metadata, ensure_ascii=False),
                record.created_at,
                record.updated_at,
            ),
        )
        conn.commit()
        logger.info(f"Sample added: {record.id}, filename={record.filename}")
        return record

    def get_sample(self, sample_id: str) -> Optional[SampleRecord]:
        conn = self.db._get_conn()
        row = conn.execute(
            f"SELECT * FROM {TABLE_SAMPLES} WHERE id = ? AND is_deleted = 0",
            (sample_id,),
        ).fetchone()
        return SampleRecord.from_row(row) if row else None

    def update_sample(
        self,
        sample_id: str,
        label: Optional[str] = None,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict] = None,
    ) -> bool:
        sample = self.get_sample(sample_id)
        if not sample:
            logger.warning(f"Sample not found: {sample_id}")
            return False

        updates = []
        params = []

        if label is not None:
            updates.append("label = ?")
            params.append(label)
        if category is not None:
            updates.append("category = ?")
            params.append(category)
        if tags is not None:
            updates.append("tags = ?")
            params.append(json.dumps(tags, ensure_ascii=False))
        if metadata is not None:
            updates.append("metadata = ?")
            params.append(json.dumps(metadata, ensure_ascii=False))

        updates.append("updated_at = ?")
        params.append(time.time())
        params.append(sample_id)

        conn = self.db._get_conn()
        conn.execute(
            f"UPDATE {TABLE_SAMPLES} SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        conn.commit()
        logger.info(f"Sample updated: {sample_id}")
        return True

    def delete_sample(self, sample_id: str, permanent: bool = False) -> bool:
        conn = self.db._get_conn()
        if permanent:
            conn.execute(f"DELETE FROM {TABLE_SAMPLES} WHERE id = ?", (sample_id,))
            self._delete_audio_file(sample_id)
            logger.info(f"Sample permanently deleted: {sample_id}")
        else:
            conn.execute(
                f"UPDATE {TABLE_SAMPLES} SET is_deleted = 1, updated_at = ? WHERE id = ?",
                (time.time(), sample_id),
            )
            logger.info(f"Sample soft deleted: {sample_id}")
        conn.commit()
        return True

    def list_samples(
        self,
        label: Optional[str] = None,
        category: Optional[str] = None,
        source_type: Optional[str] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[SampleRecord]:
        conditions = ["is_deleted = 0"]
        params = []

        if label:
            conditions.append("label = ?")
            params.append(label)
        if category:
            conditions.append("category = ?")
            params.append(category)
        if source_type:
            conditions.append("source_type = ?")
            params.append(source_type)
        if start_time:
            conditions.append("created_at >= ?")
            params.append(start_time)
        if end_time:
            conditions.append("created_at <= ?")
            params.append(end_time)

        params.extend([limit, offset])
        conn = self.db._get_conn()
        rows = conn.execute(
            f"SELECT * FROM {TABLE_SAMPLES} WHERE {' AND '.join(conditions)} "
            f"ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params,
        ).fetchall()

        return [SampleRecord.from_row(row) for row in rows]

    def count_samples(
        self,
        label: Optional[str] = None,
        category: Optional[str] = None,
        source_type: Optional[str] = None,
    ) -> int:
        conditions = ["is_deleted = 0"]
        params = []

        if label:
            conditions.append("label = ?")
            params.append(label)
        if category:
            conditions.append("category = ?")
            params.append(category)
        if source_type:
            conditions.append("source_type = ?")
            params.append(source_type)

        conn = self.db._get_conn()
        row = conn.execute(
            f"SELECT COUNT(*) as cnt FROM {TABLE_SAMPLES} WHERE {' AND '.join(conditions)}",
            params,
        ).fetchone()
        return row["cnt"] if row else 0

    def save_features(
        self,
        sample_id: str,
        feature_type: str,
        feature_data: np.ndarray,
        metadata: Optional[Dict] = None,
    ) -> str:
        feature_id = str(uuid.uuid4())
        conn = self.db._get_conn()
        conn.execute(
            f"""
            INSERT INTO {TABLE_SAMPLE_FEATURES}
            (id, sample_id, feature_type, feature_data, feature_shape, feature_dim, metadata, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                feature_id,
                sample_id,
                feature_type,
                feature_data.tobytes(),
                json.dumps(list(feature_data.shape)),
                feature_data.size,
                json.dumps(metadata or {}, ensure_ascii=False),
                time.time(),
            ),
        )
        conn.commit()
        logger.info(f"Features saved: {feature_id}, type={feature_type}, sample={sample_id}")
        return feature_id

    def get_features(self, sample_id: str, feature_type: Optional[str] = None) -> List[Dict]:
        conn = self.db._get_conn()
        conditions = ["sample_id = ?"]
        params = [sample_id]

        if feature_type:
            conditions.append("feature_type = ?")
            params.append(feature_type)

        rows = conn.execute(
            f"SELECT * FROM {TABLE_SAMPLE_FEATURES} WHERE {' AND '.join(conditions)} ORDER BY created_at DESC",
            params,
        ).fetchall()

        results = []
        for row in rows:
            feature_data = np.frombuffer(row["feature_data"], dtype=np.float32) if row["feature_data"] else np.array([])
            shape = json.loads(row["feature_shape"]) if row["feature_shape"] else []
            if shape:
                feature_data = feature_data.reshape(shape)
            results.append({
                "id": row["id"],
                "sample_id": row["sample_id"],
                "feature_type": row["feature_type"],
                "feature_data": feature_data,
                "feature_shape": shape,
                "feature_dim": row["feature_dim"],
                "metadata": json.loads(row["metadata"]) if row["metadata"] else {},
                "created_at": row["created_at"],
            })
        return results

    def save_classification_result(
        self,
        sample_id: str,
        predicted_label: str,
        confidence: float,
        probabilities: Dict[str, float],
        model_type: str = "",
        model_version: str = "",
        latency_ms: float = 0.0,
        feature_data: Optional[np.ndarray] = None,
    ) -> str:
        result_id = str(uuid.uuid4())
        conn = self.db._get_conn()
        conn.execute(
            f"""
            INSERT INTO {TABLE_CLASSIFICATION_RESULTS}
            (id, sample_id, predicted_label, confidence, probabilities, model_type,
             model_version, latency_ms, feature_data, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                result_id,
                sample_id,
                predicted_label,
                confidence,
                json.dumps(probabilities, ensure_ascii=False),
                model_type,
                model_version,
                latency_ms,
                feature_data.tobytes() if feature_data is not None else None,
                time.time(),
            ),
        )
        conn.commit()
        logger.info(f"Classification result saved: {result_id}, label={predicted_label}, confidence={confidence:.4f}")
        return result_id

    def get_classification_results(self, sample_id: str, limit: int = 10) -> List[Dict]:
        conn = self.db._get_conn()
        rows = conn.execute(
            f"SELECT * FROM {TABLE_CLASSIFICATION_RESULTS} WHERE sample_id = ? ORDER BY created_at DESC LIMIT ?",
            (sample_id, limit),
        ).fetchall()

        results = []
        for row in rows:
            results.append({
                "id": row["id"],
                "sample_id": row["sample_id"],
                "predicted_label": row["predicted_label"],
                "confidence": row["confidence"],
                "probabilities": json.loads(row["probabilities"]) if row["probabilities"] else {},
                "model_type": row["model_type"],
                "model_version": row["model_version"],
                "latency_ms": row["latency_ms"],
                "created_at": row["created_at"],
                "created_at_str": datetime.fromtimestamp(row["created_at"]).isoformat(),
            })
        return results

    def get_statistics(self) -> Dict[str, Any]:
        conn = self.db._get_conn()
        total_samples = conn.execute(
            f"SELECT COUNT(*) as cnt FROM {TABLE_SAMPLES} WHERE is_deleted = 0"
        ).fetchone()["cnt"]

        label_counts = conn.execute(
            f"SELECT label, COUNT(*) as cnt FROM {TABLE_SAMPLES} WHERE is_deleted = 0 AND label IS NOT NULL GROUP BY label"
        ).fetchall()

        category_counts = conn.execute(
            f"SELECT category, COUNT(*) as cnt FROM {TABLE_SAMPLES} WHERE is_deleted = 0 AND category IS NOT NULL GROUP BY category"
        ).fetchall()

        source_counts = conn.execute(
            f"SELECT source_type, COUNT(*) as cnt FROM {TABLE_SAMPLES} WHERE is_deleted = 0 GROUP BY source_type"
        ).fetchall()

        total_features = conn.execute(
            f"SELECT COUNT(*) as cnt FROM {TABLE_SAMPLE_FEATURES}"
        ).fetchone()["cnt"]

        total_results = conn.execute(
            f"SELECT COUNT(*) as cnt FROM {TABLE_CLASSIFICATION_RESULTS}"
        ).fetchone()["cnt"]

        avg_duration = conn.execute(
            f"SELECT AVG(duration) as avg_dur FROM {TABLE_SAMPLES} WHERE is_deleted = 0 AND duration > 0"
        ).fetchone()["avg_dur"]

        total_size = conn.execute(
            f"SELECT SUM(file_size) as total FROM {TABLE_SAMPLES} WHERE is_deleted = 0"
        ).fetchone()["total"]

        return {
            "total_samples": total_samples,
            "total_features": total_features,
            "total_classification_results": total_results,
            "total_size_bytes": total_size or 0,
            "total_size_mb": (total_size or 0) / (1024 * 1024),
            "avg_duration_seconds": avg_duration or 0.0,
            "label_distribution": {row["label"]: row["cnt"] for row in label_counts},
            "category_distribution": {row["category"]: row["cnt"] for row in category_counts},
            "source_distribution": {row["source_type"]: row["cnt"] for row in source_counts},
        }

    def search_samples(
        self,
        query: str,
        limit: int = 50,
    ) -> List[SampleRecord]:
        conn = self.db._get_conn()
        rows = conn.execute(
            f"""
            SELECT * FROM {TABLE_SAMPLES}
            WHERE is_deleted = 0 AND (
                filename LIKE ? OR
                label LIKE ? OR
                category LIKE ? OR
                tags LIKE ?
            )
            ORDER BY created_at DESC LIMIT ?
            """,
            (f"%{query}%", f"%{query}%", f"%{query}%", f"%{query}%", limit),
        ).fetchall()
        return [SampleRecord.from_row(row) for row in rows]

    def _save_audio_file(
        self, sample_id: str, filename: str, audio_data: np.ndarray, sample_rate: int
    ) -> str:
        ext = Path(filename).suffix.lower() or ".wav"
        save_path = self.storage_dir / f"{sample_id}{ext}"
        try:
            import soundfile as sf
            sf.write(str(save_path), audio_data, sample_rate)
        except ImportError:
            try:
                import librosa
                import soundfile as sf
                sf.write(str(save_path), audio_data, sample_rate)
            except ImportError:
                np.save(str(save_path.with_suffix(".npy")), audio_data)
                save_path = save_path.with_suffix(".npy")
        logger.info(f"Audio file saved: {save_path}")
        return str(save_path)

    def _delete_audio_file(self, sample_id: str):
        for ext in [".wav", ".mp3", ".flac", ".npy", ".ogg", ".m4a"]:
            path = self.storage_dir / f"{sample_id}{ext}"
            if path.exists():
                path.unlink()
                logger.info(f"Audio file deleted: {path}")

    def load_audio(self, sample_id: str) -> Optional[np.ndarray]:
        sample = self.get_sample(sample_id)
        if not sample or not sample.file_path:
            return None

        file_path = Path(sample.file_path)
        if not file_path.exists():
            return None

        if file_path.suffix == ".npy":
            return np.load(str(file_path))

        try:
            import librosa
            data, sr = librosa.load(str(file_path), sr=sample.sample_rate, mono=True)
            return data
        except ImportError:
            try:
                import soundfile as sf
                data, sr = sf.read(str(file_path), dtype="float32")
                if len(data.shape) > 1:
                    data = data.mean(axis=1)
                return data
            except ImportError:
                return None


def get_sample_manager() -> SampleManager:
    return SampleManager()
