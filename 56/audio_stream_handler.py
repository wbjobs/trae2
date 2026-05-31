import asyncio
import uuid
import os
import time
import threading
from typing import Dict, Optional, Callable
from collections import deque
from datetime import datetime

import numpy as np
import soundfile as sf
from fastapi import WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException

from config import settings
from database import get_db, AudioSample, ProcessingLog
from schemas import AudioStreamInfo, AudioUploadResponse


class AudioStreamSession:
    def __init__(self, device_id: str, sample_rate: int = 44100, channels: int = 1):
        self.stream_id = str(uuid.uuid4())
        self.device_id = device_id
        self.sample_rate = sample_rate
        self.channels = channels
        self.audio_buffer = deque()
        self.buffer_duration = 0.0
        self.target_duration = settings.AUDIO_DURATION
        self.is_active = True
        self.start_time = datetime.utcnow()
        self.chunks_received = 0
        self.total_bytes = 0
        self._lock = threading.Lock()

    def add_audio_chunk(self, audio_data: bytes):
        with self._lock:
            self.audio_buffer.append(audio_data)
            self.chunks_received += 1
            self.total_bytes += len(audio_data)
            samples = len(audio_data) / (2 * self.channels)
            self.buffer_duration += samples / self.sample_rate

    def get_complete_segment(self) -> Optional[bytes]:
        with self._lock:
            if self.buffer_duration >= self.target_duration:
                segment_data = b''.join(self.audio_buffer)
                self.audio_buffer.clear()
                self.buffer_duration = 0.0
                return segment_data
        return None

    def get_stats(self) -> dict:
        return {
            "stream_id": self.stream_id,
            "device_id": self.device_id,
            "start_time": self.start_time.isoformat(),
            "is_active": self.is_active,
            "chunks_received": self.chunks_received,
            "total_bytes": self.total_bytes,
            "buffer_duration": self.buffer_duration
        }


class StreamManager:
    def __init__(self):
        self.active_streams: Dict[str, AudioStreamSession] = {}
        self._lock = threading.Lock()
        self.max_streams = settings.MAX_CONCURRENT_STREAMS
        self.segment_callbacks: list = []

    def register_segment_callback(self, callback: Callable):
        self.segment_callbacks.append(callback)

    def start_stream(self, device_id: str, sample_rate: int = 44100,
                     channels: int = 1) -> Optional[AudioStreamSession]:
        with self._lock:
            if len(self.active_streams) >= self.max_streams:
                return None

            session = AudioStreamSession(device_id, sample_rate, channels)
            self.active_streams[session.stream_id] = session
            return session

    def end_stream(self, stream_id: str) -> bool:
        with self._lock:
            if stream_id in self.active_streams:
                session = self.active_streams[stream_id]
                session.is_active = False
                del self.active_streams[stream_id]
                return True
            return False

    def get_stream(self, stream_id: str) -> Optional[AudioStreamSession]:
        return self.active_streams.get(stream_id)

    def get_all_streams(self) -> list:
        return [s.get_stats() for s in self.active_streams.values()]

    def process_stream_chunk(self, stream_id: str, audio_data: bytes) -> Optional[str]:
        session = self.get_stream(stream_id)
        if not session or not session.is_active:
            return None

        session.add_audio_chunk(audio_data)
        segment = session.get_complete_segment()

        if segment:
            return self._save_segment(session, segment)
        return None

    def _save_segment(self, session: AudioStreamSession, segment_data: bytes) -> str:
        sample_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file_name = f"{session.device_id}_{timestamp}_{sample_id[:8]}.wav"
        file_path = os.path.join(settings.SAMPLE_STORAGE_DIR, file_name)

        try:
            audio_array = np.frombuffer(segment_data, dtype=np.int16).astype(np.float32) / 32768.0
            if len(audio_array.shape) > 1:
                audio_array = audio_array.mean(axis=1)

            sf.write(file_path, audio_array, session.sample_rate)

            for callback in self.segment_callbacks:
                asyncio.create_task(callback(sample_id, file_path, session.device_id))

            return sample_id
        except Exception as e:
            print(f"Error saving audio segment: {e}")
            return None


stream_manager = StreamManager()


async def save_uploaded_file(file: UploadFile, device_id: str) -> AudioUploadResponse:
    sample_id = str(uuid.uuid4())
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    ext = os.path.splitext(file.filename)[1] or '.wav'
    file_name = f"{device_id}_{timestamp}_{sample_id[:8]}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, file_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    try:
        with sf.SoundFile(file_path) as sf_file:
            duration = len(sf_file) / sf_file.samplerate
            sample_rate = sf_file.samplerate
            channels = sf_file.channels
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid audio file: {e}")

    db = next(get_db())
    audio_sample = AudioSample(
        sample_id=sample_id,
        device_id=device_id,
        file_path=file_path,
        file_name=file_name,
        duration=duration,
        sample_rate=sample_rate,
        channels=channels,
        file_size=len(content)
    )
    db.add(audio_sample)
    db.commit()
    db.close()

    return AudioUploadResponse(
        sample_id=sample_id,
        device_id=device_id,
        file_name=file_name,
        status="success",
        message="Audio file uploaded successfully"
    )


async def handle_websocket_audio(websocket: WebSocket, device_id: str):
    await websocket.accept()

    session = stream_manager.start_stream(device_id)
    if not session:
        await websocket.close(code=1013, reason="Max streams reached")
        return

    try:
        await websocket.send_json({
            "type": "stream_started",
            "stream_id": session.stream_id,
            "device_id": device_id,
            "sample_rate": session.sample_rate
        })

        while True:
            data = await websocket.receive_bytes()

            sample_id = stream_manager.process_stream_chunk(session.stream_id, data)

            if sample_id:
                await websocket.send_json({
                    "type": "segment_saved",
                    "sample_id": sample_id,
                    "stream_id": session.stream_id
                })

            stats = session.get_stats()
            await websocket.send_json({
                "type": "stream_stats",
                **stats
            })

    except WebSocketDisconnect:
        stream_manager.end_stream(session.stream_id)
        print(f"Stream {session.stream_id} disconnected")
    except Exception as e:
        stream_manager.end_stream(session.stream_id)
        print(f"Stream error: {e}")
