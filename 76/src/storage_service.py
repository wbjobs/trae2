import os
import io
import uuid
import json
import soundfile as sf
import numpy as np
from typing import Optional, Dict, Any, Tuple
from datetime import datetime
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
import aiofiles

from .config import settings

logger = logging.getLogger(__name__)


class StorageService:
    def __init__(
        self,
        upload_path: Optional[str] = None,
        sample_path: Optional[str] = None,
        max_workers: int = 10
    ):
        self.upload_path = upload_path or settings.upload_storage_path
        self.sample_path = sample_path or settings.sample_storage_path
        self.max_workers = max_workers
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        
        os.makedirs(self.upload_path, exist_ok=True)
        os.makedirs(self.sample_path, exist_ok=True)

    async def save_uploaded_file(
        self,
        file_content: bytes,
        file_name: str,
        motor_type: Optional[str] = None
    ) -> Dict[str, Any]:
        file_id = f"upload_{uuid.uuid4().hex[:16]}"
        ext = os.path.splitext(file_name)[1] or ".wav"
        
        save_dir = os.path.join(self.upload_path, motor_type) if motor_type else self.upload_path
        os.makedirs(save_dir, exist_ok=True)
        
        save_name = f"{file_id}_{os.path.splitext(file_name)[0]}{ext}"
        file_path = os.path.join(save_dir, save_name)
        
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(file_content)
        
        file_size = len(file_content)
        
        try:
            audio_data, sample_rate = await asyncio.get_event_loop().run_in_executor(
                self._executor,
                sf.read,
                file_path
            )
            duration = len(audio_data) / sample_rate
            channels = audio_data.ndim if audio_data.ndim > 1 else 1
        except Exception as e:
            logger.warning(f"Could not read audio file metadata: {e}")
            audio_data = None
            sample_rate = None
            duration = None
            channels = None
        
        return {
            "file_id": file_id,
            "file_path": file_path,
            "file_name": save_name,
            "original_name": file_name,
            "file_size": file_size,
            "sample_rate": sample_rate,
            "duration": duration,
            "channels": channels,
            "audio_data": audio_data
        }

    async def save_audio_data(
        self,
        audio_data: np.ndarray,
        sample_rate: int,
        motor_type: str,
        fault_type: Optional[str] = None,
        prefix: str = "audio"
    ) -> Dict[str, Any]:
        file_id = f"{prefix}_{uuid.uuid4().hex[:16]}"
        
        save_dir = os.path.join(self.sample_path, motor_type, fault_type or "processed")
        os.makedirs(save_dir, exist_ok=True)
        
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file_name = f"{file_id}_{timestamp}.wav"
        file_path = os.path.join(save_dir, file_name)
        
        await asyncio.get_event_loop().run_in_executor(
            self._executor,
            sf.write,
            file_path,
            audio_data,
            sample_rate
        )
        
        file_size = os.path.getsize(file_path)
        duration = len(audio_data) / sample_rate
        
        return {
            "file_id": file_id,
            "file_path": file_path,
            "file_name": file_name,
            "file_size": file_size,
            "sample_rate": sample_rate,
            "duration": duration,
            "channels": audio_data.ndim if audio_data.ndim > 1 else 1
        }

    async def save_denoised_audio(
        self,
        audio_data: np.ndarray,
        sample_rate: int,
        original_file_id: str,
        motor_type: str
    ) -> Dict[str, Any]:
        return await self.save_audio_data(
            audio_data,
            sample_rate,
            motor_type,
            "denoised",
            f"denoised_{original_file_id}"
        )

    async def save_features(
        self,
        features: Dict[str, float],
        file_id: str,
        motor_type: str
    ) -> str:
        save_dir = os.path.join(self.sample_path, motor_type, "features")
        os.makedirs(save_dir, exist_ok=True)
        
        file_path = os.path.join(save_dir, f"{file_id}_features.json")
        
        async with aiofiles.open(file_path, 'w', encoding='utf-8') as f:
            await f.write(json.dumps(features, indent=2, ensure_ascii=False))
        
        return file_path

    async def save_diagnosis_result(
        self,
        result: Dict[str, Any],
        record_id: str,
        motor_type: str
    ) -> str:
        save_dir = os.path.join(self.sample_path, motor_type, "diagnosis")
        os.makedirs(save_dir, exist_ok=True)
        
        file_path = os.path.join(save_dir, f"{record_id}_result.json")
        
        async with aiofiles.open(file_path, 'w', encoding='utf-8') as f:
            await f.write(json.dumps(result, indent=2, ensure_ascii=False))
        
        return file_path

    async def load_audio(
        self,
        file_path: str
    ) -> Optional[Tuple[np.ndarray, int]]:
        if not os.path.exists(file_path):
            return None
        
        try:
            audio_data, sample_rate = await asyncio.get_event_loop().run_in_executor(
                self._executor,
                sf.read,
                file_path
            )
            return audio_data, sample_rate
        except Exception as e:
            logger.error(f"Failed to load audio {file_path}: {e}")
            return None

    async def load_features(
        self,
        file_path: str
    ) -> Optional[Dict[str, float]]:
        if not os.path.exists(file_path):
            return None
        
        try:
            async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                content = await f.read()
            return json.loads(content)
        except Exception as e:
            logger.error(f"Failed to load features {file_path}: {e}")
            return None

    async def delete_file(
        self,
        file_path: str
    ) -> bool:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete file {file_path}: {e}")
            return False

    def get_file_info(
        self,
        file_path: str
    ) -> Optional[Dict[str, Any]]:
        if not os.path.exists(file_path):
            return None
        
        stat = os.stat(file_path)
        return {
            "file_path": file_path,
            "file_size": stat.st_size,
            "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
        }

    async def save_stream_chunk(
        self,
        chunk_data: bytes,
        session_id: str,
        chunk_index: int,
        motor_type: str
    ) -> str:
        save_dir = os.path.join(self.upload_path, "streams", session_id)
        os.makedirs(save_dir, exist_ok=True)
        
        file_path = os.path.join(save_dir, f"chunk_{chunk_index:08d}.bin")
        
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(chunk_data)
        
        return file_path

    async def assemble_stream(
        self,
        session_id: str,
        sample_rate: int,
        motor_type: str,
        channels: int = 1,
        format: str = "wav"
    ) -> Optional[Dict[str, Any]]:
        chunks_dir = os.path.join(self.upload_path, "streams", session_id)
        if not os.path.exists(chunks_dir):
            return None
        
        chunk_files = sorted([
            f for f in os.listdir(chunks_dir) if f.startswith("chunk_") and f.endswith(".bin")
        ])
        
        if not chunk_files:
            return None
        
        audio_chunks = []
        for chunk_file in chunk_files:
            chunk_path = os.path.join(chunks_dir, chunk_file)
            async with aiofiles.open(chunk_path, 'rb') as f:
                chunk_data = await f.read()
            audio_array = np.frombuffer(chunk_data, dtype=np.float32)
            audio_chunks.append(audio_array)
        
        full_audio = np.concatenate(audio_chunks)
        
        result = await self.save_audio_data(
            full_audio,
            sample_rate,
            motor_type,
            "stream",
            f"stream_{session_id}"
        )
        
        return result

    def get_storage_stats(self) -> Dict[str, Any]:
        def get_dir_size(path: str) -> int:
            total = 0
            for root, dirs, files in os.walk(path):
                for f in files:
                    fp = os.path.join(root, f)
                    if os.path.exists(fp):
                        total += os.path.getsize(fp)
            return total
        
        return {
            "upload_storage": {
                "path": self.upload_path,
                "size_mb": round(get_dir_size(self.upload_path) / (1024 * 1024), 2)
            },
            "sample_storage": {
                "path": self.sample_path,
                "size_mb": round(get_dir_size(self.sample_path) / (1024 * 1024), 2)
            }
        }

    def save_denoised_audio_sync(
        self,
        audio_data: np.ndarray,
        sample_rate: int,
        original_file_id: str,
        motor_type: str
    ) -> Dict[str, Any]:
        return self.save_audio_data_sync(
            audio_data,
            sample_rate,
            motor_type,
            "denoised",
            f"denoised_{original_file_id}"
        )

    def save_audio_data_sync(
        self,
        audio_data: np.ndarray,
        sample_rate: int,
        motor_type: str,
        fault_type: Optional[str] = None,
        prefix: str = "audio"
    ) -> Dict[str, Any]:
        file_id = f"{prefix}_{uuid.uuid4().hex[:16]}"
        
        save_dir = os.path.join(self.sample_path, motor_type, fault_type or "processed")
        os.makedirs(save_dir, exist_ok=True)
        
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file_name = f"{file_id}_{timestamp}.wav"
        file_path = os.path.join(save_dir, file_name)
        
        sf.write(file_path, audio_data, sample_rate)
        
        file_size = os.path.getsize(file_path)
        duration = len(audio_data) / sample_rate
        
        return {
            "file_id": file_id,
            "file_path": file_path,
            "file_name": file_name,
            "file_size": file_size,
            "sample_rate": sample_rate,
            "duration": duration,
            "channels": audio_data.ndim if audio_data.ndim > 1 else 1
        }

    def save_features_sync(
        self,
        features: Dict[str, float],
        file_id: str,
        motor_type: str
    ) -> str:
        save_dir = os.path.join(self.sample_path, motor_type, "features")
        os.makedirs(save_dir, exist_ok=True)
        
        file_path = os.path.join(save_dir, f"{file_id}_features.json")
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(json.dumps(features, indent=2, ensure_ascii=False))
        
        return file_path

    def save_diagnosis_result_sync(
        self,
        result: Dict[str, Any],
        record_id: str,
        motor_type: str
    ) -> str:
        save_dir = os.path.join(self.sample_path, motor_type, "diagnosis")
        os.makedirs(save_dir, exist_ok=True)
        
        file_path = os.path.join(save_dir, f"{record_id}_result.json")
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(json.dumps(result, indent=2, ensure_ascii=False))
        
        return file_path

    def close(self):
        self._executor.shutdown(wait=True)
