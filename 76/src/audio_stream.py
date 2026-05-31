import asyncio
import uuid
import json
import numpy as np
import soundfile as sf
from typing import Dict, Optional, Callable, Any
from datetime import datetime
from collections import defaultdict
import logging
from concurrent.futures import ThreadPoolExecutor

from .config import settings
from .denoiser import AudioDenoiser
from .feature_extractor import FeatureExtractor
from .ai_classifier import AIClassifier
from .storage_service import StorageService
from .schemas import DiagnosisResult, FaultTypeEnum

logger = logging.getLogger(__name__)


class StreamSession:
    def __init__(
        self,
        session_id: str,
        motor_id: str,
        motor_type: str,
        sample_rate: int,
        channels: int,
        client_ip: str,
        denoiser: AudioDenoiser,
        feature_extractor: FeatureExtractor,
        classifier: AIClassifier,
        storage: StorageService
    ):
        self.session_id = session_id
        self.motor_id = motor_id
        self.motor_type = motor_type
        self.sample_rate = sample_rate
        self.channels = channels
        self.client_ip = client_ip
        self.created_at = datetime.utcnow()
        self.last_activity = datetime.utcnow()
        
        self.denoiser = denoiser
        self.feature_extractor = feature_extractor
        self.classifier = classifier
        self.storage = storage
        
        self.chunk_index = 0
        self.total_chunks = 0
        self.total_duration = 0.0
        self.audio_buffer = []
        self.buffer_duration = 0.0
        self.min_diagnosis_duration = 2.0
        
        self.is_active = True
        self.diagnosis_results = []
        
        self._executor = ThreadPoolExecutor(max_workers=4)

    async def process_chunk(self, chunk_data: bytes) -> Dict[str, Any]:
        self.last_activity = datetime.utcnow()
        self.chunk_index += 1
        self.total_chunks += 1
        
        try:
            audio_chunk = np.frombuffer(chunk_data, dtype=np.float32)
            if self.channels > 1:
                audio_chunk = audio_chunk.reshape(-1, self.channels)
            
            chunk_duration = len(audio_chunk) / self.sample_rate
            self.total_duration += chunk_duration
            self.buffer_duration += chunk_duration
            self.audio_buffer.append(audio_chunk)
            
            await self.storage.save_stream_chunk(
                chunk_data,
                self.session_id,
                self.chunk_index,
                self.motor_type
            )
            
            diagnosis = None
            if self.buffer_duration >= self.min_diagnosis_duration:
                diagnosis = await self._run_diagnosis()
                self.audio_buffer = []
                self.buffer_duration = 0.0
            
            return {
                "session_id": self.session_id,
                "chunk_index": self.chunk_index,
                "duration_received": self.total_duration,
                "buffer_duration": self.buffer_duration,
                "diagnosis": diagnosis,
                "status": "ok"
            }
            
        except Exception as e:
            logger.error(f"Error processing chunk for session {self.session_id}: {e}")
            return {
                "session_id": self.session_id,
                "chunk_index": self.chunk_index,
                "status": "error",
                "error": str(e)
            }

    async def _run_diagnosis(self) -> Optional[Dict[str, Any]]:
        try:
            start_time = datetime.utcnow()
            
            audio_data = np.concatenate(self.audio_buffer)
            if audio_data.ndim > 1:
                audio_data = audio_data.mean(axis=1)
            
            loop = asyncio.get_event_loop()
            
            denoised_audio = await loop.run_in_executor(
                self._executor,
                self.denoiser.denoise,
                audio_data,
                self.sample_rate,
                "combined"
            )
            
            features = await loop.run_in_executor(
                self._executor,
                self.feature_extractor.extract_all_features,
                denoised_audio,
                self.sample_rate
            )
            
            prediction, confidence, probabilities = await loop.run_in_executor(
                self._executor,
                self.classifier.classify,
                features
            )
            
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            record_id = f"diag_{uuid.uuid4().hex[:16]}"
            
            result = {
                "record_id": record_id,
                "sample_id": None,
                "motor_id": self.motor_id,
                "fault_type": prediction,
                "confidence": confidence,
                "fault_probabilities": probabilities,
                "features": features,
                "processing_time_ms": processing_time,
                "is_realtime": True,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            self.diagnosis_results.append(result)
            
            await self.storage.save_diagnosis_result(result, record_id, self.motor_type)
            
            return result
            
        except Exception as e:
            logger.error(f"Diagnosis failed for session {self.session_id}: {e}")
            return None

    async def close(self) -> Dict[str, Any]:
        self.is_active = False
        
        final_audio = None
        if self.audio_buffer:
            final_audio = np.concatenate(self.audio_buffer)
        
        saved_file = None
        if final_audio is not None and len(final_audio) > 0:
            saved_file = await self.storage.save_audio_data(
                final_audio,
                self.sample_rate,
                self.motor_type,
                "stream_complete",
                f"stream_{self.session_id}"
            )
        
        self._executor.shutdown(wait=False)
        
        return {
            "session_id": self.session_id,
            "total_chunks": self.total_chunks,
            "total_duration": self.total_duration,
            "total_diagnoses": len(self.diagnosis_results),
            "saved_file": saved_file,
            "diagnosis_summary": self._get_diagnosis_summary()
        }

    def _get_diagnosis_summary(self) -> Dict[str, Any]:
        if not self.diagnosis_results:
            return {}
        
        fault_counts = defaultdict(int)
        confidences = []
        
        for result in self.diagnosis_results:
            fault_counts[result["fault_type"]] += 1
            confidences.append(result["confidence"])
        
        most_common = max(fault_counts.items(), key=lambda x: x[1])
        
        return {
            "most_common_fault": most_common[0],
            "fault_count": most_common[1],
            "total_diagnoses": len(self.diagnosis_results),
            "avg_confidence": float(np.mean(confidences)),
            "min_confidence": float(np.min(confidences)),
            "max_confidence": float(np.max(confidences)),
            "fault_distribution": dict(fault_counts)
        }


class AudioStreamManager:
    def __init__(
        self,
        denoiser: AudioDenoiser,
        feature_extractor: FeatureExtractor,
        classifier: AIClassifier,
        storage: StorageService,
        max_streams: int = 10
    ):
        self.sessions: Dict[str, StreamSession] = {}
        self.max_streams = max_streams
        self.denoiser = denoiser
        self.feature_extractor = feature_extractor
        self.classifier = classifier
        self.storage = storage

    def create_session(
        self,
        motor_id: str,
        motor_type: str,
        sample_rate: int,
        channels: int,
        client_ip: str
    ) -> Optional[StreamSession]:
        if len(self.sessions) >= self.max_streams:
            logger.warning(f"Max streams reached: {len(self.sessions)}/{self.max_streams}")
            return None
        
        session_id = f"stream_{uuid.uuid4().hex[:16]}"
        
        session = StreamSession(
            session_id=session_id,
            motor_id=motor_id,
            motor_type=motor_type,
            sample_rate=sample_rate,
            channels=channels,
            client_ip=client_ip,
            denoiser=self.denoiser,
            feature_extractor=self.feature_extractor,
            classifier=self.classifier,
            storage=self.storage
        )
        
        self.sessions[session_id] = session
        logger.info(f"Created stream session {session_id} for motor {motor_id}")
        
        return session

    def get_session(self, session_id: str) -> Optional[StreamSession]:
        return self.sessions.get(session_id)

    async def close_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        session = self.sessions.get(session_id)
        if not session:
            return None
        
        result = await session.close()
        del self.sessions[session_id]
        logger.info(f"Closed stream session {session_id}")
        
        return result

    def get_active_sessions(self) -> Dict[str, Any]:
        return {
            "total_active": len(self.sessions),
            "max_streams": self.max_streams,
            "sessions": [
                {
                    "session_id": s.session_id,
                    "motor_id": s.motor_id,
                    "motor_type": s.motor_type,
                    "created_at": s.created_at.isoformat(),
                    "last_activity": s.last_activity.isoformat(),
                    "total_chunks": s.total_chunks,
                    "total_duration": s.total_duration,
                    "diagnosis_count": len(s.diagnosis_results)
                }
                for s in self.sessions.values()
            ]
        }

    def cleanup_inactive(self, timeout_seconds: int = 300) -> int:
        now = datetime.utcnow()
        closed_count = 0
        
        for session_id, session in list(self.sessions.items()):
            inactive_time = (now - session.last_activity).total_seconds()
            if inactive_time > timeout_seconds:
                logger.info(f"Cleaning up inactive session {session_id}")
                asyncio.create_task(self.close_session(session_id))
                closed_count += 1
        
        return closed_count
