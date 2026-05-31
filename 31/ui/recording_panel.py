"""
录屏控件 - 提供仿真过程录制的UI界面
"""

import os
import time
from PyQt5.QtCore import Qt, pyqtSignal, QTimer
from PyQt5.QtGui import QColor, QFont
from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QComboBox,
    QSpinBox, QDoubleSpinBox, QGroupBox, QFormLayout, QProgressBar,
    QFileDialog, QMessageBox, QCheckBox
)

from .recorder.recorder import ScreenRecorder, RecordingFormat, RecordingStatus, RecordingSettings


class RecordingPanel(QWidget):
    recording_started = pyqtSignal()
    recording_stopped = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._recorder: ScreenRecorder | None = None
        self._target_widget = None
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(10)

        title = QLabel('Simulation Recording')
        title.setStyleSheet('color: #4fc3f7; font-size: 14px; font-weight: bold;')
        layout.addWidget(title)

        settings_group = QGroupBox('Settings')
        settings_group.setStyleSheet("""
            QGroupBox {
                color: #81c784; border: 1px solid #555;
                border-radius: 6px; margin-top: 12px; padding: 10px;
                font-weight: bold;
            }
            QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 5px; }
        """)
        settings_layout = QFormLayout(settings_group)
        settings_layout.setSpacing(8)

        self.format_combo = QComboBox()
        self.format_combo.addItem('PNG Sequence', RecordingFormat.PNG_SEQUENCE)
        self.format_combo.addItem('JPEG Sequence', RecordingFormat.JPEG_SEQUENCE)
        self.format_combo.addItem('WebP', RecordingFormat.WEBP)
        self.format_combo.setStyleSheet('color: #ddd; background: #3d3d3d; border: 1px solid #555; padding: 4px;')
        settings_layout.addRow('Format:', self.format_combo)

        self.fps_spin = QSpinBox()
        self.fps_spin.setRange(1, 60)
        self.fps_spin.setValue(30)
        self.fps_spin.setStyleSheet('color: #ddd; background: #3d3d3d; border: 1px solid #555; padding: 4px;')
        settings_layout.addRow('FPS:', self.fps_spin)

        self.quality_spin = QSpinBox()
        self.quality_spin.setRange(1, 100)
        self.quality_spin.setValue(90)
        self.quality_spin.setStyleSheet('color: #ddd; background: #3d3d3d; border: 1px solid #555; padding: 4px;')
        settings_layout.addRow('Quality:', self.quality_spin)

        self.scale_spin = QDoubleSpinBox()
        self.scale_spin.setRange(0.25, 2.0)
        self.scale_spin.setValue(1.0)
        self.scale_spin.setSingleStep(0.25)
        self.scale_spin.setStyleSheet('color: #ddd; background: #3d3d3d; border: 1px solid #555; padding: 4px;')
        settings_layout.addRow('Scale:', self.scale_spin)

        self.max_duration_spin = QDoubleSpinBox()
        self.max_duration_spin.setRange(10, 3600)
        self.max_duration_spin.setValue(600)
        self.max_duration_spin.setSuffix(' s')
        self.max_duration_spin.setStyleSheet('color: #ddd; background: #3d3d3d; border: 1px solid #555; padding: 4px;')
        settings_layout.addRow('Max Duration:', self.max_duration_spin)

        layout.addWidget(settings_group)

        control_group = QGroupBox('Recording Controls')
        control_group.setStyleSheet("""
            QGroupBox {
                color: #ffb74d; border: 1px solid #555;
                border-radius: 6px; margin-top: 12px; padding: 10px;
                font-weight: bold;
            }
            QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 5px; }
        """)
        control_layout = QVBoxLayout(control_group)

        btn_layout = QHBoxLayout()

        self.btn_record = QPushButton('● Record')
        self.btn_record.setStyleSheet("""
            QPushButton {
                background-color: #e53935; color: white;
                padding: 10px 20px; border-radius: 4px; font-weight: bold;
                font-size: 12px;
            }
            QPushButton:hover { background-color: #ef5350; }
            QPushButton:disabled { background-color: #555; color: #888; }
        """)
        self.btn_record.clicked.connect(self._on_record_clicked)
        btn_layout.addWidget(self.btn_record)

        self.btn_pause = QPushButton('❚❚ Pause')
        self.btn_pause.setStyleSheet("""
            QPushButton {
                background-color: #ff9800; color: white;
                padding: 10px 20px; border-radius: 4px; font-weight: bold;
                font-size: 12px;
            }
            QPushButton:hover { background-color: #ffa726; }
            QPushButton:disabled { background-color: #555; color: #888; }
        """)
        self.btn_pause.clicked.connect(self._on_pause_clicked)
        self.btn_pause.setEnabled(False)
        btn_layout.addWidget(self.btn_pause)

        self.btn_stop = QPushButton('■ Stop')
        self.btn_stop.setStyleSheet("""
            QPushButton {
                background-color: #616161; color: white;
                padding: 10px 20px; border-radius: 4px; font-weight: bold;
                font-size: 12px;
            }
            QPushButton:hover { background-color: #757575; }
            QPushButton:disabled { background-color: #555; color: #888; }
        """)
        self.btn_stop.clicked.connect(self._on_stop_clicked)
        self.btn_stop.setEnabled(False)
        btn_layout.addWidget(self.btn_stop)

        control_layout.addLayout(btn_layout)

        self.status_label = QLabel('Status: Idle')
        self.status_label.setStyleSheet('color: #aaa; font-family: Consolas; font-size: 11px; margin-top: 10px;')
        control_layout.addWidget(self.status_label)

        self.progress_label = QLabel('Frames: 0 | Time: 0.0s')
        self.progress_label.setStyleSheet('color: #4fc3f7; font-family: Consolas; font-size: 11px;')
        control_layout.addWidget(self.progress_label)

        self.progress_bar = QProgressBar()
        self.progress_bar.setStyleSheet("""
            QProgressBar {
                border: 1px solid #555; border-radius: 4px;
                text-align: center; color: white; background: #2d2d2d;
                height: 15px;
            }
            QProgressBar::chunk {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #e53935, stop:1 #ff9800);
                border-radius: 3px;
            }
        """)
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        control_layout.addWidget(self.progress_bar)

        layout.addWidget(control_group)

        layout.addStretch()

        self._update_timer = QTimer(self)
        self._update_timer.timeout.connect(self._update_status)
        self._update_timer.start(100)

    def set_recorder(self, recorder: ScreenRecorder) -> None:
        self._recorder = recorder
        self._recorder.register_status_callback(self._on_recorder_status)
        self._recorder.register_progress_callback(self._on_recorder_progress)

    def set_target_widget(self, widget) -> None:
        self._target_widget = widget
        if self._recorder is None:
            self._recorder = ScreenRecorder(widget)

    def _apply_settings(self) -> None:
        if self._recorder is None:
            return

        settings = RecordingSettings(
            output_dir='./recordings',
            format=self.format_combo.currentData(),
            fps=self.fps_spin.value(),
            quality=self.quality_spin.value(),
            scale=self.scale_spin.value(),
            capture_cursor=False,
            max_duration=self.max_duration_spin.value()
        )
        self._recorder.set_settings(settings)

    def _on_record_clicked(self) -> None:
        if self._target_widget is None:
            QMessageBox.warning(self, 'Error', 'No target widget set for recording')
            return

        if self._recorder is None:
            self._recorder = ScreenRecorder(self._target_widget)

        self._apply_settings()

        prefix = f'simulation_{int(time.time())}'
        success = self._recorder.start(prefix)
        if success:
            self.recording_started.emit()
            self.btn_record.setText('● Recording...')
            self.btn_record.setEnabled(False)
            self.btn_pause.setEnabled(True)
            self.btn_stop.setEnabled(True)
            self.status_label.setText('Status: Recording...')

    def _on_pause_clicked(self) -> None:
        if self._recorder is None:
            return

        if self._recorder.status == RecordingStatus.RECORDING:
            self._recorder.pause()
            self.btn_pause.setText('▶ Resume')
            self.status_label.setText('Status: Paused')
        elif self._recorder.status == RecordingStatus.PAUSED:
            self._recorder.resume()
            self.btn_pause.setText('❚❚ Pause')
            self.status_label.setText('Status: Recording...')

    def _on_stop_clicked(self) -> None:
        if self._recorder is None:
            return

        output_path = self._recorder.stop()
        self.btn_record.setText('● Record')
        self.btn_record.setEnabled(True)
        self.btn_pause.setText('❚❚ Pause')
        self.btn_pause.setEnabled(False)
        self.btn_stop.setEnabled(False)

        self.recording_stopped.emit(output_path)

        if output_path:
            self.status_label.setText(f'Status: Saved to {output_path}')
            QMessageBox.information(
                self, 'Recording Complete',
                f'Recording saved to:\n{output_path}'
            )
        else:
            self.status_label.setText('Status: Idle')

    def _on_recorder_status(self, status: RecordingStatus) -> None:
        status_text = {
            RecordingStatus.IDLE: 'Idle',
            RecordingStatus.RECORDING: 'Recording...',
            RecordingStatus.PAUSED: 'Paused',
            RecordingStatus.FINALIZING: 'Finalizing...',
            RecordingStatus.COMPLETED: 'Completed',
            RecordingStatus.FAILED: 'Failed',
        }.get(status, 'Unknown')
        self.status_label.setText(f'Status: {status_text}')

    def _on_recorder_progress(self, frame: int, elapsed: float) -> None:
        self.progress_label.setText(f'Frames: {frame} | Time: {elapsed:.1f}s')
        max_dur = self.max_duration_spin.value()
        if max_dur > 0:
            progress = min(100, int(elapsed / max_dur * 100))
            self.progress_bar.setValue(progress)

    def _update_status(self) -> None:
        if self._recorder and self._recorder.status == RecordingStatus.RECORDING:
            elapsed = self._recorder.elapsed_time
            frames = self._recorder.frame_count
            self.progress_label.setText(f'Frames: {frames} | Time: {elapsed:.1f}s')
            max_dur = self.max_duration_spin.value()
            if max_dur > 0:
                progress = min(100, int(elapsed / max_dur * 100))
                self.progress_bar.setValue(progress)

    def is_recording(self) -> bool:
        return self._recorder is not None and self._recorder.status in (
            RecordingStatus.RECORDING, RecordingStatus.PAUSED
        )
