"""
音频流接收接口模块
支持麦克风实时采集和录音文件上传，多路音频并发处理
"""
import asyncio
import io
import time
import uuid
import logging
from enum import Enum
from typing import Dict, Optional, Tuple

import numpy as np

from config import (
    SAMPLE_RATE,
    CHUNK_SAMPLES,
    MAX_CONCURRENT_STREAMS,
    STREAM_QUEUE_SIZE,
    ALLOWED_AUDIO_EXTENSIONS,
    MAX_SAMPLE_SIZE_MB,
)

logger = logging.getLogger(__name__)


class AudioSource(Enum):
    MICROPHONE = "microphone"
    FILE_UPLOAD = "file_upload"
    NETWORK_STREAM = "network_stream"


class StreamState(Enum):
    INITIALIZED = "initialized"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"
    COMPLETED = "completed"
    ERROR = "error"


class AudioChunk:
    __slots__ = ("data", "timestamp", "sample_rate", "duration")

    def __init__(self, data: np.ndarray, timestamp: float, sample_rate: int = SAMPLE_RATE):
        self.data = data.astype(np.float32)
        self.timestamp = timestamp
        self.sample_rate = sample_rate
        self.duration = len(data) / sample_rate

    def to_bytes(self) -> bytes:
        return self.data.tobytes()

    def __repr__(self) -> str:
        return f"AudioChunk(samples={len(self.data)}, duration={self.duration:.3f}s, ts={self.timestamp:.3f})"


class AudioStreamManager:
    _instance: Optional["AudioStreamManager"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._streams: Dict[str, "AudioStream"] = {}
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_STREAMS)
        self._initialized = True

    async def create_stream(
        self,
        source: AudioSource,
        source_id: Optional[str] = None,
        sample_rate: int = SAMPLE_RATE,
        metadata: Optional[dict] = None,
    ) -> "AudioStream":
        async with self._semaphore:
            stream_id = source_id or str(uuid.uuid4())
            if stream_id in self._streams:
                logger.warning(f"Stream {stream_id} already exists, replacing")
                await self.remove_stream(stream_id)

            stream = AudioStream(
                stream_id=stream_id,
                source=source,
                sample_rate=sample_rate,
                metadata=metadata or {},
            )
            self._streams[stream_id] = stream
            logger.info(f"Created audio stream: {stream_id}, source={source.value}")
            return stream

    async def remove_stream(self, stream_id: str) -> bool:
        if stream_id in self._streams:
            stream = self._streams.pop(stream_id)
            await stream.stop()
            logger.info(f"Removed audio stream: {stream_id}")
            return True
        return False

    def get_stream(self, stream_id: str) -> Optional["AudioStream"]:
        return self._streams.get(stream_id)

    def list_streams(self) -> list:
        return [
            {
                "stream_id": s.stream_id,
                "source": s.source.value,
                "state": s.state.value,
                "sample_rate": s.sample_rate,
                "chunks_received": s.chunks_received,
                "created_at": s.created_at,
                "metadata": s.metadata,
            }
            for s in self._streams.values()
        ]

    def get_active_count(self) -> int:
        return sum(1 for s in self._streams.values() if s.state in (StreamState.RUNNING, StreamState.PAUSED))

    async def cleanup_stopped_streams(self, max_age_seconds: int = 300):
        now = time.time()
        to_remove = []
        for stream_id, stream in self._streams.items():
            if stream.state in (StreamState.STOPPED, StreamState.ERROR, StreamState.COMPLETED):
                if hasattr(stream, "stopped_at") and now - stream.stopped_at > max_age_seconds:
                    to_remove.append(stream_id)
        for stream_id in to_remove:
            await self.remove_stream(stream_id)


class AudioStream:
    def __init__(
        self,
        stream_id: str,
        source: AudioSource,
        sample_rate: int = SAMPLE_RATE,
        metadata: Optional[dict] = None,
    ):
        self.stream_id = stream_id
        self.source = source
        self.sample_rate = sample_rate
        self.metadata = metadata or {}
        self.state = StreamState.INITIALIZED
        self.chunks_received = 0
        self.created_at = time.time()
        self.stopped_at: Optional[float] = None
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=STREAM_QUEUE_SIZE)
        self._buffer: list = []
        self._lock = asyncio.Lock()

    async def start(self):
        self.state = StreamState.RUNNING
        logger.info(f"Stream {self.stream_id} started")

    async def pause(self):
        self.state = StreamState.PAUSED
        logger.info(f"Stream {self.stream_id} paused")

    async def resume(self):
        self.state = StreamState.RUNNING
        logger.info(f"Stream {self.stream_id} resumed")

    async def stop(self):
        self.state = StreamState.STOPPED
        self.stopped_at = time.time()
        for _ in range(self._queue.qsize()):
            try:
                self._queue.put_nowait(None)
            except asyncio.QueueFull:
                break
        logger.info(f"Stream {self.stream_id} stopped, total chunks: {self.chunks_received}")

    async def write_chunk(self, data: np.ndarray, timestamp: Optional[float] = None) -> bool:
        if self.state != StreamState.RUNNING:
            logger.warning(f"Stream {self.stream_id} is not running, state={self.state.value}")
            return False

        chunk = AudioChunk(
            data=data,
            timestamp=timestamp if timestamp is not None else time.time(),
            sample_rate=self.sample_rate,
        )
        try:
            self._queue.put_nowait(chunk)
            self.chunks_received += 1
            return True
        except asyncio.QueueFull:
            logger.warning(f"Stream {self.stream_id} queue full, dropping chunk")
            return False

    async def write_bytes(self, raw_bytes: bytes, timestamp: Optional[float] = None) -> bool:
        try:
            audio_array = np.frombuffer(raw_bytes, dtype=np.float32)
        except Exception as e:
            logger.error(f"Failed to decode audio bytes: {e}")
            return False
        return await self.write_chunk(audio_array, timestamp)

    async def read_chunk(self, timeout: float = 1.0) -> Optional[AudioChunk]:
        try:
            chunk = await asyncio.wait_for(self._queue.get(), timeout=timeout)
            return chunk
        except asyncio.TimeoutError:
            return None

    def get_buffer(self) -> np.ndarray:
        if not self._buffer:
            return np.array([], dtype=np.float32)
        return np.concatenate(self._buffer)

    def add_to_buffer(self, chunk: AudioChunk):
        self._buffer.append(chunk.data)

    def clear_buffer(self):
        self._buffer.clear()

    def get_stats(self) -> dict:
        return {
            "stream_id": self.stream_id,
            "source": self.source.value,
            "state": self.state.value,
            "sample_rate": self.sample_rate,
            "chunks_received": self.chunks_received,
            "queue_size": self._queue.qsize(),
            "buffer_size": len(self._buffer),
            "created_at": self.created_at,
            "metadata": self.metadata,
        }


class AudioFileLoader:
    SUPPORTED_BACKENDS = ["soundfile", "librosa", "pydub"]

    @staticmethod
    def validate_file(file_path: str) -> Tuple[bool, str]:
        import os
        path = Path(file_path)
        if not path.exists():
            return False, f"File not found: {file_path}"
        ext = path.suffix.lower()
        if ext not in ALLOWED_AUDIO_EXTENSIONS:
            return False, f"Unsupported format: {ext}, allowed: {ALLOWED_AUDIO_EXTENSIONS}"
        file_size_mb = path.stat().st_size / (1024 * 1024)
        if file_size_mb > MAX_SAMPLE_SIZE_MB:
            return False, f"File too large: {file_size_mb:.1f}MB, max: {MAX_SAMPLE_SIZE_MB}MB"
        return True, "OK"

    @staticmethod
    def load_audio(
        file_path: str,
        sample_rate: int = SAMPLE_RATE,
        mono: bool = True,
        backend: str = "librosa",
    ) -> Tuple[np.ndarray, int]:
        valid, msg = AudioFileLoader.validate_file(file_path)
        if not valid:
            raise ValueError(msg)

        if backend == "soundfile":
            try:
                import soundfile as sf
                data, sr = sf.read(file_path, dtype="float32")
                if mono and len(data.shape) > 1:
                    data = data.mean(axis=1)
                if sr != sample_rate:
                    data = AudioFileLoader._resample(data, sr, sample_rate)
                return data.astype(np.float32), sample_rate
            except ImportError:
                logger.warning("soundfile not available, falling back to librosa")

        if backend in ("librosa", "pydub"):
            try:
                import librosa
                data, sr = librosa.load(file_path, sr=sample_rate, mono=mono, dtype=np.float32)
                return data.astype(np.float32), sample_rate
            except ImportError:
                logger.warning("librosa not available, trying pydub")

        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_file(file_path)
            if mono:
                audio = audio.set_channels(1)
            audio = audio.set_frame_rate(sample_rate)
            samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
            if audio.sample_width == 2:
                samples /= 32768.0
            elif audio.sample_width == 4:
                samples /= 2147483648.0
            return samples, sample_rate
        except ImportError as e:
            raise RuntimeError(f"No audio backend available. Install soundfile, librosa, or pydub. Error: {e}")

    @staticmethod
    def _resample(data: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
        try:
            import librosa
            return librosa.resample(data, orig_sr=orig_sr, target_sr=target_sr)
        except ImportError:
            from scipy import signal
            num_samples = int(len(data) * target_sr / orig_sr)
            return signal.resample(data, num_samples).astype(np.float32)

    @staticmethod
    def split_into_chunks(
        data: np.ndarray,
        chunk_size: int = CHUNK_SAMPLES,
        overlap: int = 0,
        pad_last: bool = True,
    ) -> list:
        chunks = []
        step = chunk_size - overlap
        for i in range(0, len(data), step):
            chunk = data[i : i + chunk_size]
            if len(chunk) < chunk_size:
                if pad_last:
                    chunk = np.pad(chunk, (0, chunk_size - len(chunk)))
                else:
                    break
            chunks.append(chunk)
        return chunks

    @staticmethod
    def load_audio_from_bytes(
        raw_bytes: bytes,
        sample_rate: int = SAMPLE_RATE,
        file_format: str = "wav",
    ) -> Tuple[np.ndarray, int]:
        try:
            import librosa
            import soundfile as sf
            audio_buffer = io.BytesIO(raw_bytes)
            data, sr = sf.read(audio_buffer, dtype="float32")
            if len(data.shape) > 1:
                data = data.mean(axis=1)
            if sr != sample_rate:
                data = AudioFileLoader._resample(data, sr, sample_rate)
            return data.astype(np.float32), sample_rate
        except Exception:
            try:
                from pydub import AudioSegment
                audio_buffer = io.BytesIO(raw_bytes)
                audio = AudioSegment.from_file(audio_buffer, format=file_format)
                audio = audio.set_channels(1).set_frame_rate(sample_rate)
                samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
                if audio.sample_width == 2:
                    samples /= 32768.0
                elif audio.sample_width == 4:
                    samples /= 2147483648.0
                return samples, sample_rate
            except ImportError as e:
                raise RuntimeError(f"Cannot load audio from bytes: {e}")


from pathlib import Path
