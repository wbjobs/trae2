"""
批量校验器 - 管理多个G代码程序的批量校验
"""

import os
import time
import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional, Callable
from datetime import datetime

from core.parser import GCodeParser
from simulation import Simulator, MachineModel, SimulationState
from collision import CollisionDetector, CollisionResult
from report import ReportGenerator, ReportData, ReportCollisionEvent, ReportLimitEvent, ReportError, ReportWarning
from config import load_config


class BatchStatus(Enum):
    PENDING = 'pending'
    QUEUED = 'queued'
    RUNNING = 'running'
    COMPLETED = 'completed'
    FAILED = 'failed'
    SKIPPED = 'skipped'


@dataclass
class BatchJob:
    filepath: str
    status: BatchStatus = BatchStatus.PENDING
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    command_count: int = 0
    collision_count: int = 0
    warning_count: int = 0
    error_count: int = 0
    total_path_length: float = 0.0
    simulation_duration: float = 0.0
    report_path: str = ''
    error_message: str = ''
    results: List = field(default_factory=list)


@dataclass
class BatchResult:
    total_jobs: int = 0
    completed_jobs: int = 0
    failed_jobs: int = 0
    total_collisions: int = 0
    total_warnings: int = 0
    total_errors: int = 0
    total_processing_time: float = 0.0
    jobs: List[BatchJob] = field(default_factory=list)
    summary_report_path: str = ''


class BatchVerifier:
    def __init__(self):
        self._config = load_config()
        self._machine_model = MachineModel.from_config(self._config)
        self._parser = GCodeParser()
        self._jobs: List[BatchJob] = []
        self._current_job_index: int = 0
        self._is_running: bool = False
        self._stop_flag: bool = False
        self._pause_flag: bool = False
        self._lock = threading.Lock()
        self._worker_thread: Optional[threading.Thread] = None
        self._progress_callbacks: List[Callable] = []
        self._job_callbacks: List[Callable] = []
        self._completion_callbacks: List[Callable] = []
        self._max_concurrent: int = 1

    def add_file(self, filepath: str) -> bool:
        if not os.path.exists(filepath):
            return False
        job = BatchJob(filepath=filepath)
        self._jobs.append(job)
        return True

    def add_files(self, filepaths: List[str]) -> int:
        count = 0
        for fp in filepaths:
            if self.add_file(fp):
                count += 1
        return count

    def add_directory(self, directory: str, extensions: Optional[List[str]] = None) -> int:
        if extensions is None:
            extensions = ['.nc', '.tap', '.gcode', '.cnc', '.txt']

        count = 0
        for root, _, files in os.walk(directory):
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext in extensions:
                    if self.add_file(os.path.join(root, f)):
                        count += 1
        return count

    def get_jobs(self) -> List[BatchJob]:
        return list(self._jobs)

    def clear_jobs(self) -> None:
        self._jobs.clear()
        self._current_job_index = 0

    def remove_job(self, index: int) -> bool:
        if 0 <= index < len(self._jobs):
            if self._jobs[index].status not in (BatchStatus.RUNNING,):
                del self._jobs[index]
                return True
        return False

    def register_progress_callback(self, callback: Callable) -> None:
        self._progress_callbacks.append(callback)

    def register_job_callback(self, callback: Callable) -> None:
        self._job_callbacks.append(callback)

    def register_completion_callback(self, callback: Callable) -> None:
        self._completion_callbacks.append(callback)

    def _emit_progress(self, current: int, total: int, job: BatchJob) -> None:
        for cb in self._progress_callbacks:
            try:
                cb(current, total, job)
            except Exception:
                pass

    def _emit_job_completed(self, job: BatchJob) -> None:
        for cb in self._job_callbacks:
            try:
                cb(job)
            except Exception:
                pass

    def start(self) -> None:
        if self._is_running:
            return

        self._is_running = True
        self._stop_flag = False
        self._pause_flag = False
        self._worker_thread = threading.Thread(target=self._run_batch, daemon=True)
        self._worker_thread.start()

    def stop(self) -> None:
        self._stop_flag = True

    def pause(self) -> None:
        self._pause_flag = True

    def resume(self) -> None:
        self._pause_flag = False

    def is_running(self) -> bool:
        return self._is_running

    def _run_batch(self) -> None:
        batch_start = time.time()
        total = len(self._jobs)

        for i, job in enumerate(self._jobs):
            if self._stop_flag:
                job.status = BatchStatus.SKIPPED
                continue

            while self._pause_flag and not self._stop_flag:
                time.sleep(0.1)

            self._current_job_index = i
            self._process_job(job)

            self._emit_progress(i + 1, total, job)
            self._emit_job_completed(job)

        self._is_running = False

        result = self._compile_results()
        result.total_processing_time = time.time() - batch_start

        for cb in self._completion_callbacks:
            try:
                cb(result)
            except Exception:
                pass

    def _process_job(self, job: BatchJob) -> None:
        job.status = BatchStatus.RUNNING
        job.start_time = datetime.now()

        try:
            commands = self._parser.parse_file(job.filepath)
            job.command_count = len(commands)

            if not commands:
                job.status = BatchStatus.FAILED
                job.error_message = 'No commands parsed from file'
                job.end_time = datetime.now()
                return

            sim = Simulator(self._machine_model)
            sim.load_commands(commands)
            sim.set_simulation_speed(100.0)

            collision_detector = CollisionDetector(self._machine_model)
            warn_dist = self._config.get('collision', {}).get('min_distance_warning', 5.0)
            coll_dist = self._config.get('collision', {}).get('min_distance_collision', 0.1)
            collision_detector.set_warning_distance(warn_dist)
            collision_detector.set_collision_distance(coll_dist)

            sim_start = time.time()
            while sim.current_command_index < len(commands) and not self._stop_flag:
                sim.step()
                pos = sim.current_position
                collisions = collision_detector.check_collisions(pos)
                for c in collisions:
                    c.command_index = sim.current_command_index
                    job.results.append(c)
                    if c.is_collision:
                        job.collision_count += 1
                    else:
                        job.warning_count += 1

            job.simulation_duration = time.time() - sim_start
            job.total_path_length = sim.current_path.total_length

            errors = []
            warnings = []
            for cmd in commands:
                for err in cmd.errors:
                    errors.append((cmd.line_number, err))
                for warn in cmd.warnings:
                    warnings.append((cmd.line_number, warn))

            job.error_count = len(errors)
            job.warning_count += len(warnings)

            report_data = self._build_report_data(job, commands, sim)
            generator = ReportGenerator(report_data)

            output_dir = self._config.get('report', {}).get('output_dir', './reports')
            os.makedirs(output_dir, exist_ok=True)
            job.report_path = generator.generate_html(output_dir)

            job.status = BatchStatus.COMPLETED

        except Exception as e:
            job.status = BatchStatus.FAILED
            job.error_message = str(e)
        finally:
            job.end_time = datetime.now()

    def _build_report_data(self, job: BatchJob, commands, sim) -> ReportData:
        data = ReportData(
            filename=job.filepath,
            machine_name=self._machine_model.name,
            start_time=job.start_time or datetime.now(),
            end_time=job.end_time or datetime.now(),
            total_commands=job.command_count,
            processed_commands=sim.current_command_index,
            total_path_length=job.total_path_length,
            rapid_path_length=sim.current_path.rapid_length,
            feed_path_length=sim.current_path.feed_length,
            simulation_duration=job.simulation_duration
        )

        from report.models import ReportCollisionEvent, ReportLimitEvent, ReportError, ReportWarning

        for result in job.results:
            data.collision_events.append(ReportCollisionEvent(
                timestamp=result.timestamp,
                collision_type=result.collision_type.value if result.collision_type else '',
                distance=result.distance,
                position={'X': result.position[0], 'Y': result.position[1], 'Z': result.position[2]},
                object_a=result.object_a,
                object_b=result.object_b,
                details=result.details,
                command_index=result.command_index
            ))

        for event in sim.events:
            if event.event_type.value == 'limit_violation':
                data.limit_violations.append(ReportLimitEvent(
                    timestamp=event.timestamp,
                    axis=event.data.get('axis', ''),
                    limit_type=event.data.get('limit_type', ''),
                    distance=event.data.get('distance', 0),
                    position=event.data.get('position', 0),
                    command_index=event.data.get('command_index', 0)
                ))

        for cmd in commands:
            for err in cmd.errors:
                data.errors.append(ReportError(
                    line_number=cmd.line_number,
                    message=err,
                    error_type='parsing'
                ))
            for warn in cmd.warnings:
                data.warnings.append(ReportWarning(
                    line_number=cmd.line_number,
                    message=warn
                ))

        return data

    def _compile_results(self) -> BatchResult:
        result = BatchResult()
        result.total_jobs = len(self._jobs)
        result.jobs = list(self._jobs)

        for job in self._jobs:
            if job.status == BatchStatus.COMPLETED:
                result.completed_jobs += 1
            elif job.status == BatchStatus.FAILED:
                result.failed_jobs += 1
            result.total_collisions += job.collision_count
            result.total_warnings += job.warning_count
            result.total_errors += job.error_count

        return result

    def generate_summary_report(self, output_dir: str = './reports') -> str:
        result = self._compile_results()
        os.makedirs(output_dir, exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'batch_summary_{timestamp}.html'
        filepath = os.path.join(output_dir, filename)

        html = self._render_summary_report(result)

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(html)

        result.summary_report_path = filepath
        return filepath

    def _render_summary_report(self, result: BatchResult) -> str:
        rows = ''
        for job in result.jobs:
            status_color = {
                BatchStatus.COMPLETED: '#81c784',
                BatchStatus.FAILED: '#e57373',
                BatchStatus.SKIPPED: '#ffb74d',
                BatchStatus.RUNNING: '#4fc3f7',
            }.get(job.status, '#888')

            status_text = job.status.value.upper()
            name = os.path.basename(job.filepath)
            duration = job.simulation_duration

            rows += f'''
            <tr>
                <td><span style="color: {status_color}; font-weight: bold;">{status_text}</span></td>
                <td>{name}</td>
                <td>{job.command_count}</td>
                <td>{job.collision_count}</td>
                <td>{job.warning_count}</td>
                <td>{job.error_count}</td>
                <td>{job.total_path_length:.2f}</td>
                <td>{duration:.2f}s</td>
                <td>{job.report_path or '-'}</td>
            </tr>'''

        return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Batch Verification Summary</title>
    <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #1e1e1e; color: #e0e0e0; padding: 20px; }}
        .container {{ max-width: 1400px; margin: 0 auto; }}
        h1 {{ color: #4fc3f7; border-bottom: 2px solid #4fc3f7; padding-bottom: 10px; }}
        h2 {{ color: #81c784; margin-top: 20px; }}
        .summary {{ background: #2d2d2d; padding: 20px; border-radius: 8px; margin-bottom: 20px;
                     display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }}
        .summary-item {{ background: #3d3d3d; padding: 15px; border-radius: 6px; }}
        .summary-item .label {{ font-size: 12px; color: #888; text-transform: uppercase; }}
        .summary-item .value {{ font-size: 22px; font-weight: bold; margin-top: 5px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 15px; }}
        th {{ background: #4fc3f7; color: #1e1e1e; padding: 12px; text-align: left; }}
        td {{ padding: 10px 12px; border-bottom: 1px solid #444; }}
        tr:nth-child(even) {{ background: #2d2d2d; }}
        .footer {{ text-align: center; margin-top: 40px; padding: 20px; color: #666; font-size: 12px;
                    border-top: 1px solid #444; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Batch Verification Summary Report</h1>
        <div class="summary">
            <div class="summary-item"><div class="label">Total Jobs</div><div class="value">{result.total_jobs}</div></div>
            <div class="summary-item"><div class="label">Completed</div><div class="value" style="color: #81c784;">{result.completed_jobs}</div></div>
            <div class="summary-item"><div class="label">Failed</div><div class="value" style="color: #e57373;">{result.failed_jobs}</div></div>
            <div class="summary-item"><div class="label">Collisions</div><div class="value" style="color: #e57373;">{result.total_collisions}</div></div>
            <div class="summary-item"><div class="label">Warnings</div><div class="value" style="color: #ffb74d;">{result.total_warnings}</div></div>
            <div class="summary-item"><div class="label">Errors</div><div class="value" style="color: #e57373;">{result.total_errors}</div></div>
            <div class="summary-item"><div class="label">Total Time</div><div class="value">{result.total_processing_time:.1f}s</div></div>
        </div>
        <h2>Job Details</h2>
        <table>
            <thead>
                <tr>
                    <th>Status</th><th>File</th><th>Commands</th><th>Collisions</th>
                    <th>Warnings</th><th>Errors</th><th>Path (mm)</th><th>Duration</th><th>Report</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>
        <div class="footer">CNC Batch Verifier v1.0.0 | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</div>
    </div>
</body>
</html>'''
