"""
存储服务模块
管理音频文件存储、缓存管理、存储配额检查
"""
import logging
import shutil
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

from config import (
    SAMPLE_STORAGE_DIR,
    MAX_SAMPLE_SIZE_MB,
    ALLOWED_AUDIO_EXTENSIONS,
)

logger = logging.getLogger(__name__)


class StorageQuotaExceededError(Exception):
    pass


class FileTypeNotSupportedError(Exception):
    pass


class AudioStorage:
    def __init__(self, storage_dir: Optional[str] = None):
        self.storage_dir = Path(storage_dir or SAMPLE_STORAGE_DIR)
        self.storage_dir.mkdir(exist_ok=True, parents=True)
        self._cache: Dict[str, Tuple[np.ndarray, float]] = {}
        self._max_cache_size = 100
        self._cache_ttl = 3600

    def save_audio(
        self,
        filename: str,
        audio_data: np.ndarray,
        sample_rate: int = 16000,
        sample_id: Optional[str] = None,
    ) -> Tuple[str, int]:
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_AUDIO_EXTENSIONS:
            raise FileTypeNotSupportedError(
                f"Unsupported format: {ext}, allowed: {ALLOWED_AUDIO_EXTENSIONS}"
            )

        file_size_mb = audio_data.nbytes / (1024 * 1024)
        if file_size_mb > MAX_SAMPLE_SIZE_MB:
            raise StorageQuotaExceededError(
                f"Audio data too large: {file_size_mb:.1f}MB, max: {MAX_SAMPLE_SIZE_MB}MB"
            )

        import uuid
        save_id = sample_id or str(uuid.uuid4())
        save_path = self.storage_dir / f"{save_id}{ext}"

        try:
            import soundfile as sf
            sf.write(str(save_path), audio_data, sample_rate)
        except ImportError:
            try:
                import librosa
                import soundfile as sf
                sf.write(str(save_path), audio_data, sample_rate)
            except ImportError:
                npy_path = self.storage_dir / f"{save_id}.npy"
                np.save(str(npy_path), audio_data)
                save_path = npy_path

        actual_size = save_path.stat().st_size
        logger.info(f"Audio saved: {save_path}, size={actual_size} bytes, id={save_id}")

        return str(save_path), actual_size

    def load_audio(
        self,
        file_path: str,
        sample_rate: int = 16000,
        use_cache: bool = True,
    ) -> Optional[np.ndarray]:
        path = Path(file_path)
        if not path.exists():
            logger.warning(f"File not found: {file_path}")
            return None

        if use_cache and file_path in self._cache:
            data, timestamp = self._cache[file_path]
            if time.time() - timestamp < self._cache_ttl:
                return data
            else:
                del self._cache[file_path]

        data = None
        if path.suffix == ".npy":
            data = np.load(str(path))
        else:
            try:
                import librosa
                data, sr = librosa.load(str(path), sr=sample_rate, mono=True, dtype=np.float32)
            except ImportError:
                try:
                    import soundfile as sf
                    data, sr = sf.read(str(path), dtype="float32")
                    if len(data.shape) > 1:
                        data = data.mean(axis=1)
                    if sr != sample_rate:
                        data = self._resample(data, sr, sample_rate)
                except ImportError:
                    logger.error("No audio loading backend available")

        if data is not None and use_cache:
            self._add_to_cache(file_path, data)

        return data

    def _resample(self, data: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
        try:
            import librosa
            return librosa.resample(data, orig_sr=orig_sr, target_sr=target_sr)
        except ImportError:
            from scipy import signal
            num_samples = int(len(data) * target_sr / orig_sr)
            return signal.resample(data, num_samples).astype(np.float32)

    def delete_audio(self, file_path: str) -> bool:
        path = Path(file_path)
        if path.exists():
            path.unlink()
            if file_path in self._cache:
                del self._cache[file_path]
            logger.info(f"Audio deleted: {file_path}")
            return True
        return False

    def delete_by_id(self, sample_id: str) -> bool:
        deleted = False
        for ext in list(ALLOWED_AUDIO_EXTENSIONS) + [".npy"]:
            path = self.storage_dir / f"{sample_id}{ext}"
            if path.exists():
                path.unlink()
                file_path_str = str(path)
                if file_path_str in self._cache:
                    del self._cache[file_path_str]
                deleted = True
                logger.info(f"Audio deleted for id {sample_id}: {path}")
        return deleted

    def get_file_info(self, file_path: str) -> Optional[Dict]:
        path = Path(file_path)
        if not path.exists():
            return None
        stat = path.stat()
        return {
            "path": str(path),
            "name": path.name,
            "extension": path.suffix,
            "size_bytes": stat.st_size,
            "size_mb": stat.st_size / (1024 * 1024),
            "created_at": stat.st_ctime,
            "modified_at": stat.st_mtime,
        }

    def list_files(self, extension: Optional[str] = None) -> List[Dict]:
        files = []
        for f in self.storage_dir.iterdir():
            if f.is_file():
                if extension is None or f.suffix == extension:
                    info = self.get_file_info(str(f))
                    if info:
                        files.append(info)
        return sorted(files, key=lambda x: x["modified_at"], reverse=True)

    def get_storage_stats(self) -> Dict:
        total_size = 0
        file_count = 0
        extension_counts: Dict[str, int] = {}

        for f in self.storage_dir.rglob("*"):
            if f.is_file():
                total_size += f.stat().st_size
                file_count += 1
                ext = f.suffix
                extension_counts[ext] = extension_counts.get(ext, 0) + 1

        try:
            disk_usage = shutil.disk_usage(str(self.storage_dir))
            disk_info = {
                "total_gb": disk_usage.total / (1024**3),
                "used_gb": disk_usage.used / (1024**3),
                "free_gb": disk_usage.free / (1024**3),
                "usage_percent": (disk_usage.used / disk_usage.total) * 100,
            }
        except Exception:
            disk_info = {}

        return {
            "storage_dir": str(self.storage_dir),
            "total_files": file_count,
            "total_size_bytes": total_size,
            "total_size_mb": total_size / (1024 * 1024),
            "extension_distribution": extension_counts,
            "cache_size": len(self._cache),
            "disk": disk_info,
        }

    def cleanup_cache(self, max_age_seconds: int = 3600):
        now = time.time()
        to_remove = []
        for file_path, (data, timestamp) in self._cache.items():
            if now - timestamp > max_age_seconds:
                to_remove.append(file_path)

        for fp in to_remove:
            del self._cache[fp]

        logger.info(f"Cache cleanup: removed {len(to_remove)} expired entries, remaining: {len(self._cache)}")

    def _add_to_cache(self, file_path: str, data: np.ndarray):
        if len(self._cache) >= self._max_cache_size:
            oldest_key = min(self._cache, key=lambda k: self._cache[k][1])
            del self._cache[oldest_key]

        self._cache[file_path] = (data.copy(), time.time())

    def clear_cache(self):
        self._cache.clear()
        logger.info("Cache cleared")


class TempStorage:
    def __init__(self, base_dir: Optional[str] = None):
        self.temp_dir = Path(base_dir or SAMPLE_STORAGE_DIR) / "temp"
        self.temp_dir.mkdir(exist_ok=True, parents=True)

    def save_temp(self, data: np.ndarray, filename: str) -> str:
        import uuid
        temp_id = str(uuid.uuid4())
        ext = Path(filename).suffix
        temp_path = self.temp_dir / f"{temp_id}{ext}"
        np.save(str(temp_path), data)
        return str(temp_path)

    def cleanup_temp(self, max_age_seconds: int = 3600):
        now = time.time()
        deleted = 0
        for f in self.temp_dir.iterdir():
            if f.is_file() and now - f.stat().st_mtime > max_age_seconds:
                f.unlink()
                deleted += 1
        logger.info(f"Temp cleanup: removed {deleted} expired files")

    def clear_all_temp(self):
        for f in self.temp_dir.iterdir():
            if f.is_file():
                f.unlink()
        logger.info("All temp files cleared")


def get_audio_storage() -> AudioStorage:
    return AudioStorage()
