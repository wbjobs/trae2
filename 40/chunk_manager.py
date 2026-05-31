import hashlib
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
from collections import deque
import threading
import time


@dataclass
class ChunkInfo:
    index: int
    offset: int
    size: int
    crc32: int = 0
    md5: str = ""
    status: str = "pending"
    retry_count: int = 0
    transfer_time: float = 0.0
    data: Optional[bytes] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "index": self.index,
            "offset": self.offset,
            "size": self.size,
            "crc32": f"{self.crc32:08x}",
            "md5": self.md5,
            "status": self.status,
            "retry_count": self.retry_count,
            "transfer_time": self.transfer_time,
        }


@dataclass
class FirmwareChunks:
    file_path: str
    file_size: int
    total_chunks: int
    chunks: List[ChunkInfo]
    file_md5: str = ""
    file_sha256: str = ""
    file_crc32: int = 0
    header_chunks: List[int] = field(default_factory=list)
    data_chunks: List[int] = field(default_factory=list)

    def get_chunk_data(self, index: int) -> Optional[bytes]:
        if 0 <= index < len(self.chunks):
            chunk = self.chunks[index]
            if chunk.data is not None:
                return chunk.data
            with open(self.file_path, "rb") as f:
                f.seek(chunk.offset)
                return f.read(chunk.size)
        return None


class SmartChunkStrategy:
    HEADER_SIZE = 4096
    HEADER_CHUNK_SIZE = 512
    DATA_CHUNK_SIZE_BASE = 1024
    MAX_CHUNK_SIZE = 4096
    MIN_CHUNK_SIZE = 256

    @staticmethod
    def calculate_chunks(
        file_path: str,
        base_chunk_size: int = 1024,
        header_protected: bool = True,
    ) -> FirmwareChunks:
        path = Path(file_path)
        file_size = path.stat().st_size

        with open(file_path, "rb") as f:
            file_data = f.read()

        file_md5 = hashlib.md5(file_data).hexdigest()
        file_sha256 = hashlib.sha256(file_data).hexdigest()
        file_crc32 = zlib.crc32(file_data) & 0xFFFFFFFF

        chunks: List[ChunkInfo] = []
        header_chunks: List[int] = []
        data_chunks: List[int] = []

        offset = 0
        index = 0

        if header_protected and file_size > 0:
            header_end = min(SmartChunkStrategy.HEADER_SIZE, file_size)
            while offset < header_end:
                chunk_size = min(SmartChunkStrategy.HEADER_CHUNK_SIZE, header_end - offset)
                chunk_data = file_data[offset: offset + chunk_size]
                chunk = ChunkInfo(
                    index=index,
                    offset=offset,
                    size=chunk_size,
                    crc32=zlib.crc32(chunk_data) & 0xFFFFFFFF,
                    md5=hashlib.md5(chunk_data).hexdigest(),
                    data=chunk_data,
                )
                chunks.append(chunk)
                header_chunks.append(index)
                offset += chunk_size
                index += 1

        chunk_size = SmartChunkStrategy._optimal_chunk_size(file_size, base_chunk_size)
        while offset < file_size:
            current_chunk_size = min(chunk_size, file_size - offset)
            chunk_data = file_data[offset: offset + current_chunk_size]
            chunk = ChunkInfo(
                index=index,
                offset=offset,
                size=current_chunk_size,
                crc32=zlib.crc32(chunk_data) & 0xFFFFFFFF,
                md5=hashlib.md5(chunk_data).hexdigest(),
                data=chunk_data,
            )
            chunks.append(chunk)
            data_chunks.append(index)
            offset += current_chunk_size
            index += 1

        return FirmwareChunks(
            file_path=str(file_path),
            file_size=file_size,
            total_chunks=len(chunks),
            chunks=chunks,
            file_md5=file_md5,
            file_sha256=file_sha256,
            file_crc32=file_crc32,
            header_chunks=header_chunks,
            data_chunks=data_chunks,
        )

    @staticmethod
    def _optimal_chunk_size(file_size: int, base_size: int) -> int:
        if file_size < 1024 * 1024:
            return max(SmartChunkStrategy.MIN_CHUNK_SIZE, min(base_size, 1024))
        elif file_size < 10 * 1024 * 1024:
            return min(base_size * 2, 2048)
        elif file_size < 100 * 1024 * 1024:
            return min(base_size * 4, SmartChunkStrategy.MAX_CHUNK_SIZE)
        else:
            return SmartChunkStrategy.MAX_CHUNK_SIZE


class SlidingWindowManager:
    def __init__(self, window_size: int = 5):
        self.window_size = window_size
        self._sent_indices: deque = deque()
        self._acked_indices: set = set()
        self._lock = threading.Lock()

    def can_send(self) -> bool:
        with self._lock:
            return len(self._sent_indices) < self.window_size

    def mark_sent(self, index: int):
        with self._lock:
            self._sent_indices.append(index)

    def mark_acked(self, index: int):
        with self._lock:
            self._acked_indices.add(index)
            while self._sent_indices and self._sent_indices[0] in self._acked_indices:
                self._sent_indices.popleft()

    def get_unacked(self) -> List[int]:
        with self._lock:
            return list(self._sent_indices)

    def clear(self):
        with self._lock:
            self._sent_indices.clear()
            self._acked_indices.clear()


class ChunkCache:
    def __init__(self, max_cached: int = 100):
        self._cache: Dict[int, bytes] = {}
        self._order: deque = deque()
        self._max_cached = max_cached
        self._lock = threading.Lock()

    def get(self, index: int, file_path: str, chunk: ChunkInfo) -> bytes:
        with self._lock:
            if index in self._cache:
                return self._cache[index]

        if chunk.data is not None:
            data = chunk.data
        else:
            with open(file_path, "rb") as f:
                f.seek(chunk.offset)
                data = f.read(chunk.size)

        with self._lock:
            if index not in self._cache:
                if len(self._cache) >= self._max_cached:
                    evict_index = self._order.popleft()
                    del self._cache[evict_index]
                self._cache[index] = data
                self._order.append(index)
            return data

    def clear(self):
        with self._lock:
            self._cache.clear()
            self._order.clear()


class ChunkTransferPipeline:
    def __init__(
        self,
        chunks: FirmwareChunks,
        window_size: int = 5,
        max_retries: int = 5,
    ):
        self.chunks = chunks
        self.window = SlidingWindowManager(window_size)
        self.cache = ChunkCache()
        self.max_retries = max_retries
        self._current_index = 0
        self._failed_chunks: List[int] = []
        self._lock = threading.Lock()

    def has_more(self) -> bool:
        with self._lock:
            return (
                self._current_index < self.chunks.total_chunks
                or len(self._failed_chunks) > 0
            )

    def get_next(self) -> Optional[Tuple[int, bytes, ChunkInfo]]:
        with self._lock:
            if self._failed_chunks and self.window.can_send():
                index = self._failed_chunks.pop(0)
                chunk = self.chunks.chunks[index]
                data = self.cache.get(index, self.chunks.file_path, chunk)
                self.window.mark_sent(index)
                return index, data, chunk

            if self._current_index < self.chunks.total_chunks and self.window.can_send():
                index = self._current_index
                self._current_index += 1
                chunk = self.chunks.chunks[index]
                data = self.cache.get(index, self.chunks.file_path, chunk)
                self.window.mark_sent(index)
                return index, data, chunk

        return None

    def mark_success(self, index: int, transfer_time: float = 0.0):
        with self._lock:
            self.window.mark_acked(index)
            if 0 <= index < len(self.chunks.chunks):
                self.chunks.chunks[index].status = "success"
                self.chunks.chunks[index].transfer_time = transfer_time

    def mark_failed(self, index: int, permanent: bool = False):
        with self._lock:
            self.window.mark_acked(index)
            if 0 <= index < len(self.chunks.chunks):
                self.chunks.chunks[index].retry_count += 1
                if permanent or self.chunks.chunks[index].retry_count >= self.max_retries:
                    self.chunks.chunks[index].status = "failed"
                else:
                    self.chunks.chunks[index].status = "retrying"
                    self._failed_chunks.append(index)

    def get_progress(self) -> Tuple[int, int]:
        with self._lock:
            success = sum(1 for c in self.chunks.chunks if c.status == "success")
            failed = sum(1 for c in self.chunks.chunks if c.status == "failed")
            return success, failed

    def get_failed_indices(self) -> List[int]:
        with self._lock:
            return [i for i, c in enumerate(self.chunks.chunks) if c.status == "failed"]

    def reset(self):
        with self._lock:
            self._current_index = 0
            self._failed_chunks.clear()
            self.window.clear()
            for chunk in self.chunks.chunks:
                if chunk.status == "retrying":
                    chunk.status = "pending"
                    chunk.retry_count = 0
