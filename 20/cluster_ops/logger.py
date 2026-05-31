import os
import sys
import logging
import re
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List
from logging.handlers import RotatingFileHandler

from .config import config_manager


def _clean_console_output(text: str) -> str:
    if not text:
        return ""
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)


def _safe_print(text: str) -> None:
    try:
        print(text)
    except UnicodeEncodeError:
        cleaned = text.encode(sys.stdout.encoding or 'utf-8', errors='replace').decode(
            sys.stdout.encoding or 'utf-8', errors='replace'
        )
        print(cleaned)
    except Exception:
        print(_clean_console_output(text))


def _safe_overwrite(text: str) -> None:
    try:
        sys.stdout.write('\r' + text)
        sys.stdout.flush()
    except Exception:
        try:
            cleaned = text.encode(sys.stdout.encoding or 'utf-8', errors='replace').decode(
                sys.stdout.encoding or 'utf-8', errors='replace'
            )
            sys.stdout.write('\r' + cleaned)
            sys.stdout.flush()
        except Exception:
            pass


class ColoredFormatter(logging.Formatter):
    COLORS = {
        'DEBUG': '\033[94m',
        'INFO': '\033[92m',
        'WARNING': '\033[93m',
        'ERROR': '\033[91m',
        'CRITICAL': '\033[95m',
        'RESET': '\033[0m',
    }

    def format(self, record: logging.LogRecord) -> str:
        record.message = record.getMessage()
        if self.usesTime():
            record.asctime = self.formatTime(record, self.datefmt)

        levelname = record.levelname
        if levelname in self.COLORS:
            colored_level = f"{self.COLORS[levelname]}{levelname}{self.COLORS['RESET']}"
            record.levelname = colored_level

        s = self.formatMessage(record)

        if record.exc_info:
            if not record.exc_text:
                record.exc_text = self.formatException(record.exc_info)
        if record.exc_text:
            if s[-1:] != "\n":
                s = s + "\n"
            s = s + record.exc_text
        if record.stack_info:
            if s[-1:] != "\n":
                s = s + "\n"
            s = s + self.formatStack(record.stack_info)

        return s


class ConsoleSafeStreamHandler(logging.StreamHandler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            _safe_print(msg)
            self.flush()
        except Exception:
            self.handleError(record)


class ExecutionProgress:
    def __init__(self, total: int, description: str = "Processing"):
        self.total = total
        self.description = description
        self.completed = 0
        self.success = 0
        self.failed = 0
        self.pending = total
        self._lock = threading.Lock()
        self._start_time = time.time()
        self._statuses: Dict[str, str] = {}
        self._last_update = 0
        self._min_update_interval = 0.1
        self._terminal_width = 80
        self._finished = False

    def update(self, server_name: str, success: bool, message: str = "") -> None:
        with self._lock:
            if server_name in self._statuses:
                if self._statuses[server_name] == "pending":
                    self.pending -= 1

            status = "✓" if success else "✗"
            self._statuses[server_name] = status
            self.completed += 1

            if success:
                self.success += 1
            else:
                self.failed += 1

        self._render(inline=True)

    def set_pending(self, server_names: List[str]) -> None:
        with self._lock:
            for name in server_names:
                if name not in self._statuses:
                    self._statuses[name] = "pending"

    def _get_progress_bar(self, width: int = 30) -> str:
        if self.total == 0:
            return "[" + "=" * width + "]"
        ratio = self.completed / self.total
        filled = int(ratio * width)
        bar = "=" * filled + ">" + " " * (width - filled - 1)
        if filled >= width:
            bar = "=" * width
        return f"[{bar}]"

    def _render(self, inline: bool = False) -> None:
        now = time.time()
        if not inline and now - self._last_update < self._min_update_interval:
            return
        self._last_update = now

        elapsed = now - self._start_time
        if self.completed > 0:
            eta = (elapsed / self.completed) * (self.total - self.completed)
            eta_str = f"ETA: {eta:.0f}s"
        else:
            eta_str = "ETA: --s"

        percent = (self.completed / self.total * 100) if self.total > 0 else 0
        bar = self._get_progress_bar(25)

        status_line = (
            f"{self.description} "
            f"{bar} {self.completed}/{self.total} "
            f"({percent:5.1f}%) "
            f"✓{self.success} ✗{self.failed} "
            f"| {elapsed:.1f}s {eta_str}"
        )

        status_line = status_line.ljust(self._terminal_width - 1)[:self._terminal_width - 1]

        if inline:
            _safe_overwrite(status_line)
        else:
            _safe_overwrite(status_line)

    def finish(self) -> None:
        with self._lock:
            if self._finished:
                return
            self._finished = True

        elapsed = time.time() - self._start_time
        bar = self._get_progress_bar(25)
        status_line = (
            f"{self.description} "
            f"{bar} {self.completed}/{self.total} "
            f"(100.0%) "
            f"✓{self.success} ✗{self.failed} "
            f"| {elapsed:.1f}s Done"
        )
        status_line = status_line.ljust(self._terminal_width - 1)[:self._terminal_width - 1]
        _safe_overwrite(status_line)
        print()


class ExecutionLogger:
    def __init__(self, log_dir: Optional[str] = None):
        self.config = config_manager.config.logging
        self.log_dir = Path(log_dir) if log_dir else Path(self.config.log_dir)
        self.log_dir = self.log_dir.expanduser().resolve()
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self._loggers: Dict[str, logging.Logger] = {}
        self._setup_root_logger()

    def _setup_root_logger(self) -> None:
        root_logger = logging.getLogger("cluster_ops")
        root_logger.setLevel(getattr(logging, self.config.log_level.upper()))
        root_logger.handlers.clear()

        console_handler = ConsoleSafeStreamHandler(sys.stdout)
        console_formatter = ColoredFormatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        console_handler.setFormatter(console_formatter)
        root_logger.addHandler(console_handler)

        root_logger.propagate = False

    def get_logger(self, name: str) -> logging.Logger:
        if name in self._loggers:
            return self._loggers[name]

        logger = logging.getLogger(f"cluster_ops.{name}")
        logger.setLevel(getattr(logging, self.config.log_level.upper()))

        log_file = self.log_dir / f"{name}.log"
        file_handler = RotatingFileHandler(
            str(log_file),
            maxBytes=self.config.max_bytes,
            backupCount=self.config.backup_count,
            encoding="utf-8"
        )
        file_formatter = logging.Formatter(
            self.config.log_format,
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        file_handler.setFormatter(file_formatter)
        logger.addHandler(file_handler)

        logger.propagate = True
        self._loggers[name] = logger
        return logger

    def create_progress(self, total: int, description: str = "Processing") -> ExecutionProgress:
        return ExecutionProgress(total, description)

    def create_execution_log(self, command: str, servers: list) -> Path:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        exec_log_dir = self.log_dir / "executions"
        exec_log_dir.mkdir(exist_ok=True)
        log_file = exec_log_dir / f"exec_{timestamp}.log"

        try:
            with open(log_file, "w", encoding="utf-8") as f:
                f.write(f"{'='*60}\n")
                f.write(f"Execution Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write(f"Command: {command}\n")
                f.write(f"Target Servers: {', '.join(servers)}\n")
                f.write(f"{'='*60}\n\n")
        except Exception as e:
            print(f"Warning: Failed to create execution log: {e}", file=sys.stderr)

        return log_file

    def log_execution_result(
        self,
        log_file: Path,
        server_name: str,
        command: str,
        stdout: str,
        stderr: str,
        exit_code: int,
        duration: float
    ) -> None:
        try:
            cleaned_stdout = _clean_console_output(stdout)
            cleaned_stderr = _clean_console_output(stderr)

            with open(log_file, "a", encoding="utf-8") as f:
                f.write(f"\n{'='*60}\n")
                f.write(f"Server: {server_name}\n")
                f.write(f"Command: {command}\n")
                f.write(f"Duration: {duration:.2f}s\n")
                f.write(f"Exit Code: {exit_code}\n")
                f.write(f"{'='*60}\n")
                if cleaned_stdout:
                    f.write("STDOUT:\n")
                    f.write(cleaned_stdout)
                    if not cleaned_stdout.endswith('\n'):
                        f.write('\n')
                if cleaned_stderr:
                    f.write("\nSTDERR:\n")
                    f.write(cleaned_stderr)
                    if not cleaned_stderr.endswith('\n'):
                        f.write('\n')
        except Exception as e:
            print(f"Warning: Failed to write execution log: {e}", file=sys.stderr)


class OutputFormatter:
    @staticmethod
    def print_header(text: str) -> None:
        line = "=" * 60
        _safe_print(f"\n{line}")
        _safe_print(f"  {text}")
        _safe_print(f"{line}")

    @staticmethod
    def print_server_result(server_name: str, success: bool, message: str = "") -> None:
        status = "✓ SUCCESS" if success else "✗ FAILED"
        status_color = "\033[92m" if success else "\033[91m"
        reset = "\033[0m"
        output = f"[{server_name}] {status_color}{status}{reset}"
        _safe_print(output)
        if message:
            cleaned = _clean_console_output(message)
            indented = "\n    ".join(cleaned.split("\n"))
            _safe_print(f"    {indented}")

    @staticmethod
    def print_summary(success_count: int, total_count: int, duration: float) -> None:
        line = "-" * 60
        _safe_print(f"\n{line}")
        _safe_print(f"Summary: {success_count}/{total_count} succeeded in {duration:.2f}s")
        if success_count == total_count:
            _safe_print("Status: \033[92mALL SUCCESSFUL\033[0m")
        elif success_count == 0:
            _safe_print("Status: \033[91mALL FAILED\033[0m")
        else:
            _safe_print("Status: \033[93mPARTIAL SUCCESS\033[0m")
        _safe_print(f"{line}\n")

    @staticmethod
    def print_table(headers: list, rows: list) -> None:
        col_widths = [len(_clean_console_output(str(h))) for h in headers]
        display_rows = []
        for row in rows:
            display_row = [_clean_console_output(str(cell)) for cell in row]
            display_rows.append(display_row)
            for i, cell in enumerate(display_row):
                col_widths[i] = max(col_widths[i], len(cell))

        header_row = " | ".join(
            f"{_clean_console_output(str(h)):<{col_widths[i]}}" for i, h in enumerate(headers)
        )
        separator = "-+-".join("-" * w for w in col_widths)
        _safe_print(header_row)
        _safe_print(separator)
        for display_row in display_rows:
            _safe_print(" | ".join(f"{c:<{col_widths[i]}}" for i, c in enumerate(display_row)))
        _safe_print("")


execution_logger = ExecutionLogger()
output_formatter = OutputFormatter()
