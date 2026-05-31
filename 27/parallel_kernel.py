import numpy as np
import multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from typing import List, Tuple, Dict, Any, Callable, Optional
from dataclasses import dataclass
import logging
import queue
import threading
import time

from config import GlobalConfig
from data_structures import ObservationFrame, DenoisedFrame, Spot
from data_parser import FrameDenoiser, SpotDetector


@dataclass
class ProcessingChunk:
    chunk_id: int
    frames: List[ObservationFrame]
    start_index: int
    end_index: int


@dataclass
class ChunkResult:
    chunk_id: int
    denoised_frames: List[DenoisedFrame]
    spots: List[Spot]
    processing_time: float
    success: bool
    error_message: Optional[str] = None


def _process_chunk_worker(args: Tuple[ProcessingChunk, GlobalConfig]) -> ChunkResult:
    chunk, config = args
    start_time = time.time()
    try:
        denoiser = FrameDenoiser(config)
        detector = SpotDetector(config)

        denoised_frames = []
        all_spots = []

        for frame in chunk.frames:
            denoised = denoiser.denoise(frame)
            denoised_frames.append(denoised)

            spots = detector.detect_spots(denoised)
            all_spots.extend(spots)

        processing_time = time.time() - start_time
        return ChunkResult(
            chunk_id=chunk.chunk_id,
            denoised_frames=denoised_frames,
            spots=all_spots,
            processing_time=processing_time,
            success=True
        )
    except Exception as e:
        processing_time = time.time() - start_time
        return ChunkResult(
            chunk_id=chunk.chunk_id,
            denoised_frames=[],
            spots=[],
            processing_time=processing_time,
            success=False,
            error_message=str(e)
        )


class ParallelProcessor:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")
        self.num_workers = config.processing.num_workers
        self._denoiser = None
        self._detector = None
        self._init_lock = threading.Lock() if threading.current_thread().name == 'MainThread' else None

    def _get_denoiser(self) -> FrameDenoiser:
        if self._denoiser is None:
            if self._init_lock is not None:
                with self._init_lock:
                    if self._denoiser is None:
                        self._denoiser = FrameDenoiser(self.config)
            else:
                self._denoiser = FrameDenoiser(self.config)
        return self._denoiser

    def _get_detector(self) -> SpotDetector:
        if self._detector is None:
            if self._init_lock is not None:
                with self._init_lock:
                    if self._detector is None:
                        self._detector = SpotDetector(self.config)
            else:
                self._detector = SpotDetector(self.config)
        return self._detector

    def _split_into_chunks(self, frames: List[ObservationFrame]) -> List[ProcessingChunk]:
        chunk_size = self.config.processing.chunk_size
        chunks = []
        for i in range(0, len(frames), chunk_size):
            chunk_frames = frames[i:i + chunk_size]
            chunks.append(ProcessingChunk(
                chunk_id=i // chunk_size,
                frames=chunk_frames,
                start_index=i,
                end_index=min(i + chunk_size, len(frames))
            ))
        return chunks

    def _process_chunk(self, chunk: ProcessingChunk) -> ChunkResult:
        start_time = time.time()
        try:
            denoiser = self._get_denoiser()
            detector = self._get_detector()

            denoised_frames = []
            all_spots = []

            for frame in chunk.frames:
                denoised = denoiser.denoise(frame)
                denoised_frames.append(denoised)

                spots = detector.detect_spots(denoised)
                all_spots.extend(spots)

            processing_time = time.time() - start_time
            return ChunkResult(
                chunk_id=chunk.chunk_id,
                denoised_frames=denoised_frames,
                spots=all_spots,
                processing_time=processing_time,
                success=True
            )
        except Exception as e:
            processing_time = time.time() - start_time
            return ChunkResult(
                chunk_id=chunk.chunk_id,
                denoised_frames=[],
                spots=[],
                processing_time=processing_time,
                success=False,
                error_message=str(e)
            )

    def process_frames_multiprocessing(self, frames: List[ObservationFrame]) -> Tuple[List[DenoisedFrame], List[Spot]]:
        self.logger.info(f"Starting multiprocessing with {self.num_workers} workers")
        chunks = self._split_into_chunks(frames)
        self.logger.info(f"Split {len(frames)} frames into {len(chunks)} chunks")

        all_denoised: List[DenoisedFrame] = []
        all_spots: List[Spot] = []

        worker_args = [(chunk, self.config) for chunk in chunks]

        with ProcessPoolExecutor(max_workers=self.num_workers) as executor:
            future_to_chunk = {executor.submit(_process_chunk_worker, args): args[0] for args in worker_args}

            for future in as_completed(future_to_chunk):
                chunk = future_to_chunk[future]
                try:
                    result = future.result()
                    if result.success:
                        all_denoised.extend(result.denoised_frames)
                        all_spots.extend(result.spots)
                        self.logger.debug(
                            f"Chunk {result.chunk_id} completed in {result.processing_time:.2f}s, "
                            f"detected {len(result.spots)} spots"
                        )
                    else:
                        self.logger.error(f"Chunk {result.chunk_id} failed: {result.error_message}")
                except Exception as e:
                    self.logger.error(f"Chunk {chunk.chunk_id} generated an exception: {e}")

        all_denoised.sort(key=lambda x: x.frame_id)
        self.logger.info(f"Multiprocessing completed. Total denoised frames: {len(all_denoised)}, spots: {len(all_spots)}")
        return all_denoised, all_spots

    def process_frames_threading(self, frames: List[ObservationFrame]) -> Tuple[List[DenoisedFrame], List[Spot]]:
        self.logger.info(f"Starting multithreading with {self.num_workers} workers")
        chunks = self._split_into_chunks(frames)
        self.logger.info(f"Split {len(frames)} frames into {len(chunks)} chunks")

        all_denoised: List[DenoisedFrame] = []
        all_spots: List[Spot] = []

        with ThreadPoolExecutor(max_workers=self.num_workers) as executor:
            future_to_chunk = {executor.submit(self._process_chunk, chunk): chunk for chunk in chunks}

            for future in as_completed(future_to_chunk):
                chunk = future_to_chunk[future]
                try:
                    result = future.result()
                    if result.success:
                        all_denoised.extend(result.denoised_frames)
                        all_spots.extend(result.spots)
                        self.logger.debug(
                            f"Chunk {result.chunk_id} completed in {result.processing_time:.2f}s, "
                            f"detected {len(result.spots)} spots"
                        )
                    else:
                        self.logger.error(f"Chunk {result.chunk_id} failed: {result.error_message}")
                except Exception as e:
                    self.logger.error(f"Chunk {chunk.chunk_id} generated an exception: {e}")

        all_denoised.sort(key=lambda x: x.frame_id)
        self.logger.info(f"Multithreading completed. Total denoised frames: {len(all_denoised)}, spots: {len(all_spots)}")
        return all_denoised, all_spots

    def process_frames_sequential(self, frames: List[ObservationFrame]) -> Tuple[List[DenoisedFrame], List[Spot]]:
        self.logger.info(f"Starting sequential processing of {len(frames)} frames")

        chunk = ProcessingChunk(chunk_id=0, frames=frames, start_index=0, end_index=len(frames))
        result = self._process_chunk(chunk)

        if not result.success:
            raise RuntimeError(f"Sequential processing failed: {result.error_message}")

        self.logger.info(f"Sequential processing completed in {result.processing_time:.2f}s")
        return result.denoised_frames, result.spots

    def process_frames(self, frames: List[ObservationFrame], mode: str = 'multiprocessing') -> Tuple[List[DenoisedFrame], List[Spot]]:
        if self.num_workers == 1 or len(frames) < 2:
            return self.process_frames_sequential(frames)

        if mode == 'multiprocessing':
            return self.process_frames_multiprocessing(frames)
        elif mode == 'threading':
            return self.process_frames_threading(frames)
        elif mode == 'sequential':
            return self.process_frames_sequential(frames)
        else:
            raise ValueError(f"Unknown processing mode: {mode}")


class ParallelBatchProcessor:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")
        self.task_queue: queue.Queue = queue.Queue()
        self.result_queue: queue.Queue = queue.Queue()
        self.workers: List[threading.Thread] = []
        self._stop_event = threading.Event()

    def add_task(self, task_id: str, frames: List[ObservationFrame]) -> None:
        self.task_queue.put((task_id, frames))

    def _worker_loop(self) -> None:
        processor = ParallelProcessor(self.config, self.logger)

        while not self._stop_event.is_set():
            try:
                task_id, frames = self.task_queue.get(timeout=1.0)
                try:
                    denoised, spots = processor.process_frames(frames, mode='threading')
                    self.result_queue.put((task_id, denoised, spots, None))
                except Exception as e:
                    self.result_queue.put((task_id, [], [], str(e)))
                finally:
                    self.task_queue.task_done()
            except queue.Empty:
                continue

    def start(self, num_workers: Optional[int] = None) -> None:
        num_workers = num_workers or self.config.processing.num_workers
        self.logger.info(f"Starting batch processor with {num_workers} workers")

        self._stop_event.clear()
        for i in range(num_workers):
            worker = threading.Thread(target=self._worker_loop, daemon=True)
            worker.start()
            self.workers.append(worker)

    def stop(self) -> None:
        self.logger.info("Stopping batch processor")
        self._stop_event.set()
        for worker in self.workers:
            worker.join(timeout=5.0)
        self.workers.clear()

    def get_results(self, timeout: Optional[float] = None) -> List[Tuple[str, List[DenoisedFrame], List[Spot], Optional[str]]]:
        results = []
        while not self.result_queue.empty():
            results.append(self.result_queue.get())
        return results

    def wait_all(self, timeout: Optional[float] = None) -> None:
        self.task_queue.join()


def worker_process_init(config: GlobalConfig) -> None:
    global _worker_config
    _worker_config = config


def worker_process_task(args: Tuple[int, List[ObservationFrame]]) -> ChunkResult:
    config = globals().get('_worker_config', GlobalConfig())
    processor = ParallelProcessor(config)
    chunk = ProcessingChunk(
        chunk_id=args[0],
        frames=args[1],
        start_index=0,
        end_index=len(args[1])
    )
    return processor._process_chunk(chunk)
