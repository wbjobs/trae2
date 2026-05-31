"""
屏幕录制器 - 捕获仿真视图帧并导出为视频或GIF动画
"""

import os
import time
import threading
from enum import Enum
from typing import Optional, List, Callable
from dataclasses import dataclass, field

from PyQt5.QtCore import QTimer, Qt, QRect
from PyQt5.QtGui import QImage, QPainter, QPixmap, QColor
from PyQt5.QtWidgets import QWidget


class RecordingFormat(Enum):
    PNG_SEQUENCE = 'png_sequence'
    JPEG_SEQUENCE = 'jpeg_sequence'
    WEBP = 'webp'


class RecordingStatus(Enum):
    IDLE = 'idle'
    RECORDING = 'recording'
    PAUSED = 'paused'
    FINALIZING = 'finalizing'
    COMPLETED = 'completed'
    FAILED = 'failed'


@dataclass
class RecordingSettings:
    output_dir: str = './recordings'
    format: RecordingFormat = RecordingFormat.PNG_SEQUENCE
    fps: int = 30
    quality: int = 90
    scale: float = 1.0
    capture_cursor: bool = False
    max_duration: float = 600.0


class ScreenRecorder:
    def __init__(self, target_widget: QWidget):
        self._target = target_widget
        self._settings = RecordingSettings()
        self._status = RecordingStatus.IDLE
        self._frames: List[QImage] = []
        self._frame_timestamps: List[float] = []
        self._recording_start_time: Optional[float] = None
        self._elapsed_time: float = 0.0
        self._timer: Optional[QTimer] = None
        self._frame_count: int = 0
        self._output_prefix: str = 'recording'
        self._lock = threading.Lock()
        self._status_callbacks: List[Callable] = []
        self._progress_callbacks: List[Callable] = []

    @property
    def status(self) -> RecordingStatus:
        return self._status

    @property
    def elapsed_time(self) -> float:
        if self._status == RecordingStatus.RECORDING and self._recording_start_time:
            return self._elapsed_time + (time.time() - self._recording_start_time)
        return self._elapsed_time

    @property
    def frame_count(self) -> int:
        return self._frame_count

    def set_settings(self, settings: RecordingSettings) -> None:
        if self._status == RecordingStatus.RECORDING:
            raise RuntimeError('Cannot change settings while recording')
        self._settings = settings

    def get_settings(self) -> RecordingSettings:
        return self._settings

    def register_status_callback(self, callback: Callable) -> None:
        self._status_callbacks.append(callback)

    def register_progress_callback(self, callback: Callable) -> None:
        self._progress_callbacks.append(callback)

    def _emit_status(self, status: RecordingStatus) -> None:
        for cb in self._status_callbacks:
            try:
                cb(status)
            except Exception:
                pass

    def _emit_progress(self, frame: int, elapsed: float) -> None:
        for cb in self._progress_callbacks:
            try:
                cb(frame, elapsed)
            except Exception:
                pass

    def start(self, output_prefix: str = 'recording') -> bool:
        if self._status in (RecordingStatus.RECORDING, RecordingStatus.PAUSED):
            return False

        self._output_prefix = output_prefix
        self._frames = []
        self._frame_timestamps = []
        self._frame_count = 0
        self._elapsed_time = 0.0
        self._recording_start_time = time.time()

        os.makedirs(self._settings.output_dir, exist_ok=True)

        self._timer = QTimer()
        self._timer.setInterval(int(1000 / self._settings.fps))
        self._timer.timeout.connect(self._capture_frame)
        self._timer.start()

        self._status = RecordingStatus.RECORDING
        self._emit_status(self._status)
        return True

    def pause(self) -> None:
        if self._status != RecordingStatus.RECORDING:
            return
        if self._timer:
            self._timer.stop()
        if self._recording_start_time:
            self._elapsed_time += time.time() - self._recording_start_time
            self._recording_start_time = None
        self._status = RecordingStatus.PAUSED
        self._emit_status(self._status)

    def resume(self) -> None:
        if self._status != RecordingStatus.PAUSED:
            return
        self._recording_start_time = time.time()
        if self._timer:
            self._timer.start()
        self._status = RecordingStatus.RECORDING
        self._emit_status(self._status)

    def stop(self) -> str:
        if self._status == RecordingStatus.IDLE:
            return ''

        if self._timer:
            self._timer.stop()
            self._timer = None

        if self._recording_start_time:
            self._elapsed_time += time.time() - self._recording_start_time
            self._recording_start_time = None

        self._status = RecordingStatus.FINALIZING
        self._emit_status(self._status)

        output_path = self._finalize()

        self._status = RecordingStatus.COMPLETED if output_path else RecordingStatus.FAILED
        self._emit_status(self._status)

        return output_path or ''

    def _capture_frame(self) -> None:
        if self._status != RecordingStatus.RECORDING:
            return

        try:
            if self._settings.max_duration and self.elapsed_time > self._settings.max_duration:
                self.stop()
                return

            image = self._grab_widget()
            if image is not None:
                with self._lock:
                    self._frames.append(image)
                    self._frame_timestamps.append(time.time())
                    self._frame_count += 1
                    self._emit_progress(self._frame_count, self.elapsed_time)

        except Exception as e:
            print(f"Frame capture error: {e}")

    def _grab_widget(self) -> Optional[QImage]:
        if not self._target:
            return None

        widget = self._target
        size = widget.size()
        if size.width() <= 0 or size.height() <= 0:
            return None

        image = QImage(size, QImage.Format_ARGB32)
        image.fill(QColor(30, 30, 30))

        painter = QPainter(image)
        painter.setRenderHint(QPainter.Antialiasing, True)
        painter.setRenderHint(QPainter.SmoothPixmapTransform, True)

        try:
            widget.render(painter)
        finally:
            painter.end()

        if self._settings.scale != 1.0:
            new_size = image.size()
            new_size.setWidth(int(new_size.width() * self._settings.scale))
            new_size.setHeight(int(new_size.height() * self._settings.scale))
            image = image.scaled(new_size, Qt.KeepAspectRatio, Qt.SmoothTransformation)

        return image

    def _finalize(self) -> Optional[str]:
        if not self._frames:
            return None

        timestamp = time.strftime('%Y%m%d_%H%M%S')
        base_dir = os.path.join(self._settings.output_dir, f'{self._output_prefix}_{timestamp}')
        os.makedirs(base_dir, exist_ok=True)

        fmt = self._settings.format
        if fmt in (RecordingFormat.PNG_SEQUENCE, RecordingFormat.JPEG_SEQUENCE):
            ext = 'png' if fmt == RecordingFormat.PNG_SEQUENCE else 'jpg'
            quality = self._settings.quality if fmt == RecordingFormat.JPEG_SEQUENCE else -1

            for i, frame in enumerate(self._frames):
                frame_path = os.path.join(base_dir, f'frame_{i:06d}.{ext}')
                if ext == 'jpg':
                    frame.save(frame_path, 'JPEG', quality)
                else:
                    frame.save(frame_path, 'PNG')

            return base_dir

        elif fmt == RecordingFormat.WEBP:
            for i, frame in enumerate(self._frames):
                frame_path = os.path.join(base_dir, f'frame_{i:06d}.webp')
                frame.save(frame_path, 'WEBP', self._settings.quality)
            return base_dir

        return None

    def reset(self) -> None:
        if self._status == RecordingStatus.RECORDING:
            self.stop()
        self._frames = []
        self._frame_timestamps = []
        self._frame_count = 0
        self._elapsed_time = 0.0
        self._recording_start_time = None
        self._status = RecordingStatus.IDLE
        self._emit_status(self._status)

    def get_frame(self, index: int) -> Optional[QImage]:
        if 0 <= index < len(self._frames):
            return self._frames[index]
        return None

    def get_frames(self) -> List[QImage]:
        return list(self._frames)
