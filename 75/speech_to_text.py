import asyncio
import time
import hashlib
import os
from typing import Optional, Callable
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from dataclasses import dataclass, field

from config import get_settings
from logger import setup_logger
from models import SpeechResult, AudioFormat

logger = setup_logger("speech_to_text")
settings = get_settings()


@dataclass
class TranscribeChunkResult:
    chunk_index: int
    text: str
    confidence: float
    start_time: float
    end_time: float
    retry_count: int = 0


@dataclass
class ProgressState:
    task_id: str
    total_chunks: int = 0
    completed_chunks: int = 0
    failed_chunks: list[int] = field(default_factory=list)
    partial_text: str = ""
    last_update: float = field(default_factory=time.time)


class StreamingASREngine:
    def __init__(self, model_dir: str = "", language: str = "zh-CN"):
        self.model_dir = model_dir or settings.SPEECH_MODEL_DIR
        self.language = language or settings.SPEECH_LANGUAGE
        self._loaded = False
        self._chunk_size_seconds = getattr(settings, "SPEECH_CHUNK_SECONDS", 30)
        self._max_retries = getattr(settings, "SPEECH_MAX_RETRIES", 3)
        self._chunk_timeout = getattr(settings, "SPEECH_CHUNK_TIMEOUT", 60)

    def load_model(self) -> None:
        if self._loaded:
            return
        logger.info(f"Loading Streaming ASR model, chunk_size={self._chunk_size_seconds}s, max_retries={self._max_retries}")
        if os.path.exists(self.model_dir):
            logger.info("ASR model directory found, initializing model...")
        else:
            logger.warning(f"ASR model directory not found: {self.model_dir}, using fallback mode")
        self._loaded = True
        logger.info("Streaming ASR engine loaded successfully")

    def split_audio_chunks(self, audio_data: bytes, sample_rate: int, audio_format: AudioFormat) -> list[bytes]:
        if not audio_data:
            return []

        bytes_per_second = sample_rate * 2
        if audio_format == AudioFormat.WAV:
            header_size = 44 if audio_data[:4] == b"RIFF" else 0
            audio_body = audio_data[header_size:]
        else:
            audio_body = audio_data

        chunk_bytes = bytes_per_second * self._chunk_size_seconds
        chunks = []
        for i in range(0, len(audio_body), chunk_bytes):
            chunk = audio_body[i:i + chunk_bytes]
            chunks.append(chunk)

        logger.debug(f"Audio split into {len(chunks)} chunks, each ~{self._chunk_size_seconds}s")
        return chunks

    def _transcribe_chunk_with_retry(self, chunk_data: bytes, chunk_index: int,
                                     audio_format: AudioFormat, sample_rate: int,
                                     task_id: str) -> TranscribeChunkResult:
        start_time = chunk_index * self._chunk_size_seconds
        end_time = start_time + len(chunk_data) / (sample_rate * 2) if sample_rate > 0 else start_time + self._chunk_size_seconds

        for attempt in range(self._max_retries):
            try:
                text = self._simulate_chunk_asr(chunk_data, chunk_index, attempt)
                confidence = self._calculate_chunk_confidence(chunk_data, attempt)

                return TranscribeChunkResult(
                    chunk_index=chunk_index,
                    text=text,
                    confidence=confidence,
                    start_time=round(start_time, 2),
                    end_time=round(end_time, 2),
                    retry_count=attempt,
                )
            except Exception as e:
                if attempt == self._max_retries - 1:
                    logger.warning(
                        f"Task {task_id}: Chunk {chunk_index} failed after {self._max_retries} attempts: {e}"
                    )
                    return TranscribeChunkResult(
                        chunk_index=chunk_index,
                        text="",
                        confidence=0.0,
                        start_time=round(start_time, 2),
                        end_time=round(end_time, 2),
                        retry_count=self._max_retries,
                    )
                time.sleep(0.5 * (attempt + 1))

        return TranscribeChunkResult(
            chunk_index=chunk_index,
            text="",
            confidence=0.0,
            start_time=round(start_time, 2),
            end_time=round(end_time, 2),
            retry_count=self._max_retries,
        )

    def _simulate_chunk_asr(self, chunk_data: bytes, chunk_index: int, attempt: int) -> str:
        if not chunk_data:
            return ""

        data_hash = hashlib.md5(chunk_data[:512] + str(chunk_index).encode()).hexdigest()
        hash_int = int(data_hash, 16)

        templates = [
            "现在检查设备运行状态，",
            "发现温度比正常值偏高，",
            "接头处有轻微氧化痕迹，",
            "需要记录并安排处理，",
            "绝缘层表面有粉化现象，",
            "油位计显示油位正常，",
            "听到有异常放电声音，",
            "红外测温结果显示异常，",
        ]

        idx = hash_int % len(templates)
        return templates[idx]

    def _calculate_chunk_confidence(self, chunk_data: bytes, attempt: int) -> float:
        base_conf = 0.8
        size_factor = min(1.0, len(chunk_data) / 50000)
        retry_penalty = attempt * 0.05
        return max(0.3, min(0.98, base_conf + size_factor * 0.15 - retry_penalty))

    def transcribe_streaming(
        self,
        audio_data: bytes,
        audio_format: AudioFormat,
        sample_rate: int,
        task_id: str,
        progress_callback: Optional[Callable[[ProgressState], None]] = None,
    ) -> dict:
        if not self._loaded:
            self.load_model()

        chunks = self.split_audio_chunks(audio_data, sample_rate, audio_format)
        total_chunks = len(chunks)

        if total_chunks == 0:
            return {"raw_text": "", "confidence": 0.0, "duration": 0.0, "segments": []}

        state = ProgressState(task_id=task_id, total_chunks=total_chunks)
        chunk_results: list[TranscribeChunkResult] = []
        start_time = time.time()

        for i, chunk in enumerate(chunks):
            result = self._transcribe_chunk_with_retry(chunk, i, audio_format, sample_rate, task_id)
            chunk_results.append(result)

            if result.text:
                state.partial_text += result.text
            state.completed_chunks += 1
            state.last_update = time.time()

            if result.confidence < 0.3:
                state.failed_chunks.append(i)

            if progress_callback:
                progress_callback(state)

            logger.debug(
                f"Task {task_id}: Chunk {i + 1}/{total_chunks} done, "
                f"conf={result.confidence:.3f}, retries={result.retry_count}"
            )

        valid_results = [r for r in chunk_results if r.confidence > 0.2]
        if valid_results:
            avg_confidence = sum(r.confidence for r in valid_results) / len(valid_results)
        else:
            avg_confidence = 0.0

        full_text = "".join(r.text for r in chunk_results)
        duration = total_chunks * self._chunk_size_seconds

        segments = [
            {
                "text": r.text,
                "start": r.start_time,
                "end": r.end_time,
                "confidence": round(r.confidence, 4),
                "chunk_index": r.chunk_index,
                "retry_count": r.retry_count,
            }
            for r in chunk_results
        ]

        processing_time = time.time() - start_time
        logger.info(
            f"Task {task_id}: Streaming transcription completed: "
            f"{total_chunks} chunks, {len(state.failed_chunks)} failed, "
            f"text_len={len(full_text)}, avg_conf={avg_confidence:.3f}, "
            f"time={processing_time:.1f}s"
        )

        return {
            "raw_text": full_text,
            "confidence": round(avg_confidence, 4),
            "duration": round(duration, 2),
            "segments": segments,
            "total_chunks": total_chunks,
            "failed_chunks": state.failed_chunks,
        }


class TaskTimeoutManager:
    def __init__(self, global_timeout: int = 600, check_interval: int = 30):
        self.global_timeout = global_timeout
        self.check_interval = check_interval
        self._task_timestamps: dict[str, float] = {}
        self._lock = asyncio.Lock()
        self._checker_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        self._checker_task = asyncio.create_task(self._timeout_checker_loop())
        logger.info(f"TaskTimeoutManager started, global_timeout={self.global_timeout}s")

    async def stop(self) -> None:
        if self._checker_task:
            self._checker_task.cancel()
            try:
                await self._checker_task
            except asyncio.CancelledError:
                pass
        logger.info("TaskTimeoutManager stopped")

    async def register_task(self, task_id: str) -> None:
        async with self._lock:
            self._task_timestamps[task_id] = time.time()

    async def unregister_task(self, task_id: str) -> None:
        async with self._lock:
            self._task_timestamps.pop(task_id, None)

    async def _timeout_checker_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(self.check_interval)
                await self._check_timeouts()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Timeout checker error: {e}")

    async def _check_timeouts(self) -> None:
        now = time.time()
        expired_tasks = []

        async with self._lock:
            for task_id, timestamp in list(self._task_timestamps.items()):
                if now - timestamp > self.global_timeout:
                    expired_tasks.append(task_id)
                    del self._task_timestamps[task_id]

        for task_id in expired_tasks:
            logger.warning(f"Task {task_id} exceeded global timeout {self.global_timeout}s, marked as expired")

    async def get_expired_count(self) -> int:
        async with self._lock:
            return sum(1 for t in self._task_timestamps.values()
                       if time.time() - t > self.global_timeout)


class PriorityAwareQueue:
    def __init__(self, max_size: int = 1000):
        self.max_size = max_size
        self._high_queue: asyncio.Queue = asyncio.Queue()
        self._normal_queue: asyncio.Queue = asyncio.Queue()
        self._low_queue: asyncio.Queue = asyncio.Queue()
        self._lock = asyncio.Lock()

    async def put(self, item: dict, priority: str = "normal") -> None:
        queue_map = {
            "high": self._high_queue,
            "normal": self._normal_queue,
            "low": self._low_queue,
        }
        target_queue = queue_map.get(priority, self._normal_queue)

        if target_queue.qsize() >= self.max_size:
            raise asyncio.QueueFull("Priority queue is full, apply backpressure")

        await target_queue.put(item)

    async def get(self) -> tuple[str, dict]:
        if not self._high_queue.empty():
            return "high", await self._high_queue.get()
        if not self._normal_queue.empty():
            return "normal", await self._normal_queue.get()
        return "low", await self._low_queue.get()

    def qsize(self) -> dict:
        return {
            "high": self._high_queue.qsize(),
            "normal": self._normal_queue.qsize(),
            "low": self._low_queue.qsize(),
            "total": self._high_queue.qsize() + self._normal_queue.qsize() + self._low_queue.qsize(),
        }

    def is_full(self, priority: str = "normal") -> bool:
        if priority == "high":
            return self._high_queue.qsize() >= self.max_size
        elif priority == "low":
            return self._low_queue.qsize() >= self.max_size
        return self._normal_queue.qsize() >= self.max_size


class SpeechToTextModule:
    def __init__(self, max_concurrent: Optional[int] = None):
        self.max_concurrent = max_concurrent or settings.SPEECH_MAX_CONCURRENT
        self._semaphore = asyncio.BoundedSemaphore(self.max_concurrent)
        self._executor = ThreadPoolExecutor(max_workers=self.max_concurrent * 2)
        self._engine = StreamingASREngine()
        self._results_cache: dict[str, SpeechResult] = {}
        self._timeout_manager = TaskTimeoutManager()
        self._priority_queue = PriorityAwareQueue()
        self._queue_consumer: Optional[asyncio.Task] = None
        self._deadlock_threshold = getattr(settings, "DEADLOCK_THRESHOLD", 300)
        self._last_progress = time.time()
        self._completed_since_last_check = 0
        self._lock = asyncio.Lock()
        self._initialized = False
        logger.info(
            f"SpeechToText module initialized, max_concurrent={self.max_concurrent}, "
            f"deadlock_threshold={self._deadlock_threshold}s"
        )

    async def initialize(self) -> None:
        if self._initialized:
            return
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(self._executor, self._engine.load_model)
        await self._timeout_manager.start()
        self._queue_consumer = asyncio.create_task(self._consume_queue())
        asyncio.create_task(self._deadlock_detector_loop())
        self._initialized = True
        logger.info("SpeechToText module fully initialized")

    async def _consume_queue(self) -> None:
        while True:
            try:
                priority, item = await self._priority_queue.get()
                async with self._semaphore:
                    await self._process_queue_item(item)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Queue consumer error: {e}")
                await asyncio.sleep(1)

    async def _process_queue_item(self, item: dict) -> None:
        try:
            result = await self._do_transcribe(
                task_id=item["task_id"],
                audio_data=item["audio_data"],
                audio_format=item["audio_format"],
                sample_rate=item["sample_rate"],
            )
            async with self._lock:
                self._results_cache[item["task_id"]] = result
                self._completed_since_last_check += 1
            await self._timeout_manager.unregister_task(item["task_id"])
        except Exception as e:
            logger.error(f"Queue item processing failed: {e}")

    async def _deadlock_detector_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(30)
                await self._check_for_deadlock()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Deadlock detector error: {e}")

    async def _check_for_deadlock(self) -> None:
        queue_size = self._priority_queue.qsize()
        if queue_size["total"] == 0:
            async with self._lock:
                self._last_progress = time.time()
                self._completed_since_last_check = 0
            return

        async with self._lock:
            if self._completed_since_last_check > 0:
                self._completed_since_last_check = 0
                self._last_progress = time.time()
                return

        time_since_progress = time.time() - self._last_progress
        if time_since_progress > self._deadlock_threshold:
            logger.critical(
                f"POSSIBLE DEADLOCK DETECTED! No progress in {time_since_progress:.0f}s, "
                f"queue={queue_size}"
            )
            await self._handle_potential_deadlock()

    async def _handle_potential_deadlock(self) -> None:
        logger.warning("Attempting deadlock recovery: cycling executor workers...")
        try:
            old_executor = self._executor
            self._executor = ThreadPoolExecutor(max_workers=self.max_concurrent * 2)
            old_executor.shutdown(wait=False)
            self._last_progress = time.time()
            logger.info("Executor cycling complete")
        except Exception as e:
            logger.error(f"Deadlock recovery failed: {e}")

    async def transcribe(
        self,
        task_id: str,
        audio_data: bytes,
        audio_format: AudioFormat = AudioFormat.WAV,
        sample_rate: int = 16000,
        priority: str = "normal",
    ) -> SpeechResult:
        if task_id in self._results_cache:
            return self._results_cache[task_id]

        queue_size = self._priority_queue.qsize()
        if queue_size["total"] > self.max_concurrent * 10:
            logger.warning(
                f"Backpressure applied: queue size={queue_size['total']}, "
                f"task {task_id} may be delayed"
            )

        await self._timeout_manager.register_task(task_id)

        item = {
            "task_id": task_id,
            "audio_data": audio_data,
            "audio_format": audio_format,
            "sample_rate": sample_rate,
            "submit_time": time.time(),
        }
        await self._priority_queue.put(item, priority=priority)

        wait_start = time.time()
        while task_id not in self._results_cache:
            if time.time() - wait_start > 600:
                logger.error(f"Task {task_id} timed out waiting in queue")
                return SpeechResult(task_id=task_id)
            await asyncio.sleep(0.1)

        return self._results_cache[task_id]

    async def _do_transcribe(
        self,
        task_id: str,
        audio_data: bytes,
        audio_format: AudioFormat,
        sample_rate: int,
    ) -> SpeechResult:
        start_time = time.time()
        logger.info(
            f"Task {task_id}: Starting streaming transcription, "
            f"audio_size={len(audio_data)}, format={audio_format.value}"
        )

        try:
            loop = asyncio.get_event_loop()
            result_dict = await asyncio.wait_for(
                loop.run_in_executor(
                    self._executor,
                    self._engine.transcribe_streaming,
                    audio_data,
                    audio_format,
                    sample_rate,
                    task_id,
                    None,
                ),
                timeout=getattr(settings, "SPEECH_GLOBAL_TIMEOUT", 300),
            )

            processing_time = time.time() - start_time
            result = SpeechResult(
                task_id=task_id,
                raw_text=result_dict["raw_text"],
                confidence=result_dict["confidence"],
                segments=result_dict["segments"],
                duration=result_dict["duration"],
                processing_time=round(processing_time, 3),
            )

            logger.info(
                f"Task {task_id}: Transcription completed in {processing_time:.3f}s, "
                f"text_length={len(result.raw_text)}, confidence={result.confidence}"
            )
            return result

        except asyncio.TimeoutError:
            logger.error(f"Task {task_id}: Global transcription timeout")
            return SpeechResult(task_id=task_id)
        except Exception as e:
            logger.error(f"Task {task_id}: Transcription failed: {e}")
            return SpeechResult(task_id=task_id)

    async def transcribe_batch(
        self, tasks: list[dict]
    ) -> list[SpeechResult]:
        coroutines = []
        for task in tasks:
            coro = self.transcribe(
                task_id=task["task_id"],
                audio_data=task["audio_data"],
                audio_format=task.get("audio_format", AudioFormat.WAV),
                sample_rate=task.get("sample_rate", 16000),
                priority=task.get("priority", "normal"),
            )
            coroutines.append(coro)

        results = await asyncio.gather(*coroutines, return_exceptions=True)

        processed = []
        for r in results:
            if isinstance(r, Exception):
                logger.error(f"Batch transcription error: {r}")
                processed.append(SpeechResult(task_id="error"))
            else:
                processed.append(r)

        return processed

    def get_result(self, task_id: str) -> Optional[SpeechResult]:
        return self._results_cache.get(task_id)

    def get_active_task_count(self) -> int:
        return self.max_concurrent - self._semaphore._value

    def get_queue_status(self) -> dict:
        return self._priority_queue.qsize()

    async def shutdown(self) -> None:
        logger.info("SpeechToText module shutting down...")
        if self._queue_consumer:
            self._queue_consumer.cancel()
        await self._timeout_manager.stop()
        self._executor.shutdown(wait=True)
        logger.info("SpeechToText module shut down complete")
