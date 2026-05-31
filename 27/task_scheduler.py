import numpy as np
import threading
import queue
import time
import logging
from typing import List, Dict, Optional, Callable, Any
from dataclasses import dataclass, field
from collections import defaultdict
from datetime import datetime
import os

from config import GlobalConfig
from data_structures import Task, ProcessingResult, ObservationFrame
from data_parser import RawDataParser
from parallel_kernel import ParallelProcessor
from trajectory_fitting import SpotTracker, TrajectoryFitter
from visualization import ResultVisualizer, ReportGenerator
from remote_executor import SupercomputeClient
from utils import setup_logger, save_pickle, ensure_directory


@dataclass
class RemoteJob:
    job_id: str
    task_id: str
    remote_id: Optional[str] = None
    status: str = "submitting"
    submitted_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result: Optional[ProcessingResult] = None
    error: Optional[str] = None


class LocalTaskExecutor:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")
        self.parser = RawDataParser(config)
        self.processor = ParallelProcessor(config, logger)
        self.tracker = SpotTracker(config, logger)
        self.fitter = TrajectoryFitter(config, logger)
        self.visualizer = ResultVisualizer(config, logger)
        self.reporter = ReportGenerator(config, logger)

    def execute_task(self, task: Task) -> ProcessingResult:
        self.logger.info(f"Executing task {task.task_id} locally")
        task.mark_started()

        start_time = datetime.now()
        try:
            frames = self.parser.parse_file(task.source_file)
            self.logger.info(f"Parsed {len(frames)} frames from {task.source_file}")

            denoised_frames, all_spots = self.processor.process_frames(
                frames,
                mode=task.parameters.get('processing_mode', 'multiprocessing')
            )

            spots_by_frame = defaultdict(list)
            for spot in all_spots:
                spots_by_frame[spot.frame_id].append(spot)

            tracks = self.tracker.track_spots(dict(spots_by_frame))

            trajectories = self.fitter.fit_tracks(
                tracks,
                method=task.parameters.get('fitting_method', 'auto')
            )

            end_time = datetime.now()
            processing_time = (end_time - start_time).total_seconds()

            result = ProcessingResult(
                job_id=task.task_id,
                source_file=task.source_file,
                total_frames=len(frames),
                detected_spots=len(all_spots),
                trajectories=trajectories,
                denoised_frames=denoised_frames,
                processing_time=processing_time,
                start_time=start_time,
                end_time=end_time,
                success=True
            )

            if self.config.output.save_visualization:
                vis_files = self.visualizer.visualize_result(result)
                result.metadata['visualization_files'] = vis_files

            if self.config.output.generate_report:
                text_report = self.reporter.generate_text_report(result)
                json_report = self.reporter.generate_json_report(result)
                result.metadata['text_report'] = text_report
                result.metadata['json_report'] = json_report

            if self.config.output.save_trajectory_data:
                result_path = os.path.join(
                    self.config.output.output_dir,
                    f"result_{task.task_id}.pkl"
                )
                save_pickle(result, result_path)
                result.metadata['result_file'] = result_path

            task.mark_completed(result)
            self.logger.info(f"Task {task.task_id} completed successfully in {processing_time:.2f}s")
            return result

        except Exception as e:
            end_time = datetime.now()
            processing_time = (end_time - start_time).total_seconds()

            error_msg = f"Task execution failed: {str(e)}"
            self.logger.error(error_msg)

            result = ProcessingResult(
                job_id=task.task_id,
                source_file=task.source_file,
                total_frames=0,
                detected_spots=0,
                trajectories=[],
                denoised_frames=[],
                processing_time=processing_time,
                start_time=start_time,
                end_time=end_time,
                success=False,
                error_message=error_msg
            )

            task.mark_failed(error_msg)
            return result


class TaskScheduler:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or setup_logger(config)

        self._task_queue: "queue.PriorityQueue[Tuple[int, int, Task]]" = queue.PriorityQueue()
        self._active_tasks: Dict[str, Task] = {}
        self._completed_tasks: Dict[str, Task] = {}
        self._failed_tasks: Dict[str, Task] = {}

        self._local_executor = LocalTaskExecutor(config, self.logger)
        self._remote_client = SupercomputeClient(config, self.logger) if config.supercompute.enabled else None

        self._scheduler_thread: Optional[threading.Thread] = None
        self._worker_threads: List[threading.Thread] = []
        self._stop_event = threading.Event()
        self._task_counter = 0

        self._remote_jobs: Dict[str, RemoteJob] = {}

        self.callbacks: Dict[str, List[Callable[[Task], None]]] = defaultdict(list)
        self._worker_semaphore = threading.Semaphore(config.processing.num_workers)

    def submit_task(self, task: Task) -> str:
        self._task_counter += 1
        priority = -task.priority
        self._task_queue.put((priority, self._task_counter, task))
        self.logger.info(f"Task {task.task_id} submitted to queue (priority: {task.priority})")
        return task.task_id

    def submit(self, source_file: str, task_type: str = "analysis",
               priority: int = 0, parameters: Optional[Dict] = None) -> str:
        task = Task(
            task_id="",
            task_type=task_type,
            priority=priority,
            source_file=source_file,
            parameters=parameters or {}
        )
        return self.submit_task(task)

    def on_task_completed(self, callback: Callable[[Task], None]) -> None:
        self.callbacks['completed'].append(callback)

    def on_task_failed(self, callback: Callable[[Task], None]) -> None:
        self.callbacks['failed'].append(callback)

    def _notify_callbacks(self, event: str, task: Task) -> None:
        for callback in self.callbacks.get(event, []):
            try:
                callback(task)
            except Exception as e:
                self.logger.error(f"Callback error for {event}: {e}")

    def _worker_thread_main(self) -> None:
        while not self._stop_event.is_set():
            try:
                if not self._worker_semaphore.acquire(timeout=0.1):
                    try:
                        try:
                            _, _, task = self._task_queue.get(timeout=0.1)
                        except queue.Empty:
                            self._worker_semaphore.release()
                            continue

                        try:
                            self._active_tasks[task.task_id] = task
                            self.logger.info(f"Worker processing task {task.task_id}")

                            use_remote = (
                                self.config.supercompute.enabled and
                                self._remote_client is not None and
                                task.parameters.get('use_supercompute', False)
                            )

                            if use_remote:
                                self._process_remote(task)
                            else:
                                self._process_local(task)
                        finally:
                            self._task_queue.task_done()
                    finally:
                        self._worker_semaphore.release()
            except Exception as e:
                self.logger.error(f"Worker thread error: {e}")
                time.sleep(0.5)

    def _process_local(self, task: Task) -> None:
        try:
            result = self._local_executor.execute_task(task)
            if result.success:
                self._completed_tasks[task.task_id] = task
                self._notify_callbacks('completed', task)
            else:
                self._failed_tasks[task.task_id] = task
                self._notify_callbacks('failed', task)
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            self.logger.error(error_msg)
            task.mark_failed(error_msg)
            self._failed_tasks[task.task_id] = task
            self._notify_callbacks('failed', task)
        finally:
            if task.task_id in self._active_tasks:
                del self._active_tasks[task.task_id]

    def _process_remote(self, task: Task) -> None:
        try:
            remote_job_id = self._remote_client.submit_job(task)
            if remote_job_id:
                self._remote_jobs[task.task_id] = RemoteJob(
                    job_id=remote_job_id,
                    task_id=task.task_id,
                    remote_id=remote_job_id,
                    submitted_at=datetime.now()
                )
                self.logger.info(f"Task {task.task_id} running remotely as {remote_job_id}")
            else:
                self.logger.warning(f"Remote submission failed for {task.task_id}, falling back to local")
                self._process_local(task)
        except Exception as e:
            self.logger.error(f"Remote processing failed for {task.task_id}: {e}")
            self._process_local(task)

    def _monitor_remote_jobs(self) -> None:
        if not self._remote_client:
            return

        completed = []
        for task_id, remote_job in list(self._remote_jobs.items()):
            if remote_job.status in ['completed', 'failed']:
                continue

            try:
                status = self._remote_client.check_job_status(remote_job.remote_id)

                if status == 'completed':
                    result = self._remote_client.fetch_job_result(
                        remote_job.remote_id,
                        self.config.output.output_dir
                    )
                    remote_job.status = 'completed'
                    remote_job.completed_at = datetime.now()

                    if result and task_id in self._active_tasks:
                        task = self._active_tasks[task_id]
                        task.mark_completed(result)
                        self._completed_tasks[task_id] = task
                        del self._active_tasks[task_id]
                        self._notify_callbacks('completed', task)
                    completed.append(task_id)

                elif status == 'running':
                    if remote_job.status != 'running':
                        remote_job.status = 'running'
                        remote_job.started_at = datetime.now()

            except Exception as e:
                self.logger.error(f"Error monitoring remote job {task_id}: {e}")

        for task_id in completed:
            if task_id in self._remote_jobs:
                del self._remote_jobs[task_id]

    def _scheduler_loop(self) -> None:
        self.logger.info("Task scheduler started")

        last_remote_check = 0
        remote_check_interval = self.config.supercompute.job_poll_interval

        while not self._stop_event.is_set():
            try:
                current_time = time.time()
                if (self.config.supercompute.enabled and
                    current_time - last_remote_check > remote_check_interval):
                    self._monitor_remote_jobs()
                    last_remote_check = current_time

                time.sleep(1.0)

            except Exception as e:
                self.logger.error(f"Scheduler loop error: {e}")
                time.sleep(1.0)

        self.logger.info("Task scheduler stopped")

    def start(self) -> None:
        if self._scheduler_thread is not None and self._scheduler_thread.is_alive():
            self.logger.warning("Scheduler already running")
            return

        self._stop_event.clear()

        num_workers = self.config.processing.num_workers
        self.logger.info(f"Starting {num_workers} worker threads")
        for i in range(num_workers):
            worker = threading.Thread(target=self._worker_thread_main, daemon=True, name=f"Worker-{i}")
            worker.start()
            self._worker_threads.append(worker)

        self._scheduler_thread = threading.Thread(target=self._scheduler_loop, daemon=True, name="Scheduler")
        self._scheduler_thread.start()
        self.logger.info("Scheduler started")

    def stop(self, wait: bool = True) -> None:
        self.logger.info("Stopping task scheduler")
        self._stop_event.set()

        if wait:
            for worker in self._worker_threads:
                worker.join(timeout=5.0)
            self._worker_threads.clear()

            if self._scheduler_thread:
                self._scheduler_thread.join(timeout=5.0)

        if self._remote_client:
            self._remote_client.cleanup()

    def wait_all(self, timeout: Optional[float] = None) -> None:
        start_time = time.time()
        while True:
            if self._task_queue.empty() and not self._active_tasks:
                break

            if timeout and (time.time() - start_time) > timeout:
                break

            time.sleep(0.1)

    def get_task_status(self, task_id: str) -> Optional[str]:
        if task_id in self._active_tasks:
            return self._active_tasks[task_id].status
        elif task_id in self._completed_tasks:
            return "completed"
        elif task_id in self._failed_tasks:
            return "failed"
        else:
            for _, _, task in self._task_queue.queue:
                if task.task_id == task_id:
                    return "queued"
        return None

    def get_task_result(self, task_id: str) -> Optional[ProcessingResult]:
        if task_id in self._completed_tasks:
            return self._completed_tasks[task_id].result
        elif task_id in self._active_tasks:
            return self._active_tasks[task_id].result
        return None

    def get_queue_size(self) -> int:
        return self._task_queue.qsize()

    def get_active_count(self) -> int:
        return len(self._active_tasks)

    def get_completed_count(self) -> int:
        return len(self._completed_tasks)

    def get_failed_count(self) -> int:
        return len(self._failed_tasks)

    def get_statistics(self) -> Dict[str, int]:
        return {
            'queued': self.get_queue_size(),
            'active': self.get_active_count(),
            'completed': self.get_completed_count(),
            'failed': self.get_failed_count()
        }


class PipelineProcessor:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or setup_logger(config)
        self.scheduler = TaskScheduler(config, self.logger)

    def process_file(self, filepath: str, parameters: Optional[Dict] = None,
                     wait: bool = True) -> Optional[ProcessingResult]:
        self.logger.info(f"Processing file: {filepath}")

        task_id = self.scheduler.submit(
            source_file=filepath,
            task_type="analysis",
            priority=0,
            parameters=parameters or {}
        )

        if wait:
            self.scheduler.start()
            self.scheduler.wait_all()
            return self.scheduler.get_task_result(task_id)

        return None

    def process_files_batch(self, filepaths: List[str],
                            parameters: Optional[Dict] = None) -> Dict[str, Optional[ProcessingResult]]:
        self.logger.info(f"Processing batch of {len(filepaths)} files")

        task_ids = []
        for filepath in filepaths:
            task_id = self.scheduler.submit(
                source_file=filepath,
                task_type="analysis",
                priority=0,
                parameters=parameters or {}
            )
            task_ids.append(task_id)

        self.scheduler.start()
        self.scheduler.wait_all()

        results = {}
        for task_id in task_ids:
            results[task_id] = self.scheduler.get_task_result(task_id)

        return results

    def start_server(self) -> None:
        self.scheduler.start()
        self.logger.info("Processing server started")

    def stop_server(self) -> None:
        self.scheduler.stop()
        self.logger.info("Processing server stopped")
