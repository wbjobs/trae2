"""
批量校验面板 - 提供批量G代码校验的UI界面
"""

import os
from PyQt5.QtCore import Qt, pyqtSignal
from PyQt5.QtGui import QColor, QFont
from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QListWidget,
    QListWidgetItem, QFileDialog, QMessageBox, QProgressBar, QGroupBox,
    QFormLayout, QCheckBox, QSpinBox, QHeaderView, QTableWidget, QTableWidgetItem,
    QAbstractItemView, QMenu, QAction
)

from core.batch import BatchVerifier, BatchJob, BatchStatus, BatchResult


class BatchPanel(QWidget):
    batch_started = pyqtSignal()
    batch_completed = pyqtSignal(object)
    batch_job_completed = pyqtSignal(object)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._verifier = BatchVerifier()
        self._init_callbacks()
        self._init_ui()

    def _init_callbacks(self) -> None:
        self._verifier.register_progress_callback(self._on_progress)
        self._verifier.register_job_callback(self._on_job_completed)
        self._verifier.register_completion_callback(self._on_completed)

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(10)

        title = QLabel('Batch Verification')
        title.setStyleSheet('color: #4fc3f7; font-size: 14px; font-weight: bold;')
        layout.addWidget(title)

        btn_layout = QHBoxLayout()

        self.btn_add_files = QPushButton('Add Files...')
        self.btn_add_files.setStyleSheet(self._button_style('#4fc3f7'))
        self.btn_add_files.clicked.connect(self._on_add_files)
        btn_layout.addWidget(self.btn_add_files)

        self.btn_add_dir = QPushButton('Add Directory...')
        self.btn_add_dir.setStyleSheet(self._button_style('#81c784'))
        self.btn_add_dir.clicked.connect(self._on_add_directory)
        btn_layout.addWidget(self.btn_add_dir)

        self.btn_remove = QPushButton('Remove')
        self.btn_remove.setStyleSheet(self._button_style('#ff9800'))
        self.btn_remove.clicked.connect(self._on_remove_selected)
        btn_layout.addWidget(self.btn_remove)

        self.btn_clear = QPushButton('Clear')
        self.btn_clear.setStyleSheet(self._button_style('#e57373'))
        self.btn_clear.clicked.connect(self._on_clear)
        btn_layout.addWidget(self.btn_clear)

        layout.addLayout(btn_layout)

        self.file_list = QTableWidget(0, 2)
        self.file_list.setHorizontalHeaderLabels(['Status', 'File'])
        self.file_list.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.file_list.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.file_list.verticalHeader().setVisible(False)
        self.file_list.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.file_list.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.file_list.setContextMenuPolicy(Qt.CustomContextMenu)
        self.file_list.customContextMenuRequested.connect(self._on_context_menu)
        self.file_list.setStyleSheet("""
            QTableWidget {
                background-color: #252526; color: #ddd;
                gridline-color: #444; border: 1px solid #444;
            }
            QHeaderView::section {
                background-color: #3c3c3c; color: #4fc3f7;
                padding: 6px; border: 1px solid #444; font-weight: bold;
            }
            QTableWidget::item:selected { background-color: #264f78; }
        """)
        layout.addWidget(self.file_list, 1)

        control_group = QGroupBox('Verification Controls')
        control_group.setStyleSheet("""
            QGroupBox {
                color: #ffb74d; border: 1px solid #555;
                border-radius: 6px; margin-top: 12px; padding: 10px;
                font-weight: bold;
            }
            QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 5px; }
        """)
        control_layout = QVBoxLayout(control_group)

        verify_btn_layout = QHBoxLayout()

        self.btn_start = QPushButton('▶ Start Verification')
        self.btn_start.setStyleSheet("""
            QPushButton {
                background-color: #4caf50; color: white;
                padding: 10px 24px; border-radius: 4px; font-weight: bold;
            }
            QPushButton:hover { background-color: #66bb6a; }
            QPushButton:disabled { background-color: #555; color: #888; }
        """)
        self.btn_start.clicked.connect(self._on_start)
        verify_btn_layout.addWidget(self.btn_start)

        self.btn_stop = QPushButton('■ Stop')
        self.btn_stop.setStyleSheet("""
            QPushButton {
                background-color: #e53935; color: white;
                padding: 10px 24px; border-radius: 4px; font-weight: bold;
            }
            QPushButton:hover { background-color: #ef5350; }
            QPushButton:disabled { background-color: #555; color: #888; }
        """)
        self.btn_stop.clicked.connect(self._on_stop)
        self.btn_stop.setEnabled(False)
        verify_btn_layout.addWidget(self.btn_stop)

        verify_btn_layout.addStretch()

        self.btn_report = QPushButton('📊 Generate Summary Report')
        self.btn_report.setStyleSheet("""
            QPushButton {
                background-color: #4fc3f7; color: #1e1e1e;
                padding: 10px 24px; border-radius: 4px; font-weight: bold;
            }
            QPushButton:hover { background-color: #81d4fa; }
            QPushButton:disabled { background-color: #555; color: #888; }
        """)
        self.btn_report.clicked.connect(self._on_generate_summary)
        self.btn_report.setEnabled(False)
        verify_btn_layout.addWidget(self.btn_report)

        control_layout.addLayout(verify_btn_layout)

        self.status_label = QLabel('Ready - Add files to begin batch verification')
        self.status_label.setStyleSheet('color: #aaa; font-family: Consolas; font-size: 11px; margin-top: 10px;')
        control_layout.addWidget(self.status_label)

        self.progress_bar = QProgressBar()
        self.progress_bar.setStyleSheet("""
            QProgressBar {
                border: 1px solid #555; border-radius: 4px;
                text-align: center; color: white; background: #2d2d2d;
            }
            QProgressBar::chunk {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #4fc3f7, stop:1 #81c784);
                border-radius: 3px;
            }
        """)
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        control_layout.addWidget(self.progress_bar)

        layout.addWidget(control_group)

        self._update_buttons()

    def _button_style(self, color: str) -> str:
        return f"""
            QPushButton {{
                background-color: {color}; color: #1e1e1e;
                padding: 6px 12px; border-radius: 4px; font-weight: bold;
                font-size: 11px;
            }}
            QPushButton:hover {{ background-color: {color}; opacity: 0.8; }}
            QPushButton:disabled {{ background-color: #555; color: #888; }}
        """

    def _on_add_files(self) -> None:
        files, _ = QFileDialog.getOpenFileNames(
            self, 'Select G-Code Files', '',
            'G-Code Files (*.nc *.tap *.gcode *.cnc *.txt);;All Files (*.*)'
        )
        if files:
            count = self._verifier.add_files(files)
            for f in files:
                self._add_file_to_list(f)
            self.status_label.setText(f'Added {count} file(s)')
            self._update_buttons()

    def _on_add_directory(self) -> None:
        directory = QFileDialog.getExistingDirectory(self, 'Select Directory')
        if directory:
            count = self._verifier.add_directory(directory)
            self.status_label.setText(f'Added {count} file(s) from directory')
            self._refresh_file_list()
            self._update_buttons()

    def _on_remove_selected(self) -> None:
        rows = sorted({index.row() for index in self.file_list.selectedIndexes()}, reverse=True)
        for row in rows:
            self._verifier.remove_job(row)
            self.file_list.removeRow(row)
        self._update_buttons()

    def _on_clear(self) -> None:
        self._verifier.clear_jobs()
        self.file_list.setRowCount(0)
        self.progress_bar.setValue(0)
        self.status_label.setText('Ready - Add files to begin batch verification')
        self._update_buttons()

    def _on_start(self) -> None:
        if not self._verifier.get_jobs():
            QMessageBox.warning(self, 'Warning', 'No files to verify')
            return

        self.btn_start.setEnabled(False)
        self.btn_stop.setEnabled(True)
        self.btn_add_files.setEnabled(False)
        self.btn_add_dir.setEnabled(False)
        self.btn_remove.setEnabled(False)
        self.btn_clear.setEnabled(False)
        self.progress_bar.setValue(0)
        self.status_label.setText('Batch verification started...')

        self.batch_started.emit()
        self._verifier.start()

    def _on_stop(self) -> None:
        self._verifier.stop()
        self.status_label.setText('Stopping...')

    def _on_generate_summary(self) -> None:
        output_dir = QFileDialog.getExistingDirectory(self, 'Select Report Output Directory', './reports')
        if output_dir:
            filepath = self._verifier.generate_summary_report(output_dir)
            QMessageBox.information(
                self, 'Report Generated',
                f'Batch summary report saved to:\n{filepath}'
            )

    def _on_progress(self, current: int, total: int, job: BatchJob) -> None:
        self.progress_bar.setRange(0, total)
        self.progress_bar.setValue(current)
        self.status_label.setText(f'Processing {current}/{total}: {os.path.basename(job.filepath)}')

        row = current - 1
        if 0 <= row < self.file_list.rowCount():
            self._update_row_status(row, job)

    def _on_job_completed(self, job: BatchJob) -> None:
        self.batch_job_completed.emit(job)

        for row in range(self.file_list.rowCount()):
            item = self.file_list.item(row, 1)
            if item and item.data(Qt.UserRole) == job.filepath:
                self._update_row_status(row, job)
                break

    def _on_completed(self, result: BatchResult) -> None:
        self.btn_start.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.btn_add_files.setEnabled(True)
        self.btn_add_dir.setEnabled(True)
        self.btn_remove.setEnabled(True)
        self.btn_clear.setEnabled(True)
        self.btn_report.setEnabled(True)

        self.status_label.setText(
            f'Batch completed: {result.completed_jobs}/{result.total_jobs} passed, '
            f'{result.failed_jobs} failed, {result.total_collisions} collisions'
        )
        self.batch_completed.emit(result)

    def _add_file_to_list(self, filepath: str) -> None:
        row = self.file_list.rowCount()
        self.file_list.insertRow(row)

        status_item = QTableWidgetItem('Pending')
        status_item.setForeground(QColor('#888'))
        status_item.setTextAlignment(Qt.AlignCenter)
        self.file_list.setItem(row, 0, status_item)

        file_item = QTableWidgetItem(os.path.basename(filepath))
        file_item.setData(Qt.UserRole, filepath)
        file_item.setToolTip(filepath)
        self.file_list.setItem(row, 1, file_item)

    def _refresh_file_list(self) -> None:
        self.file_list.setRowCount(0)
        for job in self._verifier.get_jobs():
            self._add_file_to_list(job.filepath)

    def _update_row_status(self, row: int, job: BatchJob) -> None:
        if row < 0 or row >= self.file_list.rowCount():
            return

        status_map = {
            BatchStatus.PENDING: ('Pending', '#888'),
            BatchStatus.QUEUED: ('Queued', '#ffb74d'),
            BatchStatus.RUNNING: ('Running', '#4fc3f7'),
            BatchStatus.COMPLETED: ('✓ Pass', '#81c784'),
            BatchStatus.FAILED: ('✗ Fail', '#e57373'),
            BatchStatus.SKIPPED: ('Skipped', '#ff9800'),
        }

        status_text, color = status_map.get(job.status, ('Unknown', '#888'))

        status_item = self.file_list.item(row, 0)
        if status_item:
            status_item.setText(status_text)
            status_item.setForeground(QColor(color))
            status_item.setFont(QFont('Arial', 9, QFont.Bold))

    def _on_context_menu(self, pos) -> None:
        item = self.file_list.itemAt(pos)
        if item is None:
            return

        row = self.file_list.row(item)

        menu = QMenu(self)

        open_action = QAction('Open File', self)
        open_action.triggered.connect(lambda: self._open_file(row))
        menu.addAction(open_action)

        open_folder_action = QAction('Open Containing Folder', self)
        open_folder_action.triggered.connect(lambda: self._open_folder(row))
        menu.addAction(open_folder_action)

        menu.exec_(self.file_list.viewport().mapToGlobal(pos))

    def _open_file(self, row: int) -> None:
        item = self.file_list.item(row, 1)
        if item:
            filepath = item.data(Qt.UserRole)
            if filepath and os.path.exists(filepath):
                os.startfile(filepath)

    def _open_folder(self, row: int) -> None:
        item = self.file_list.item(row, 1)
        if item:
            filepath = item.data(Qt.UserRole)
            if filepath and os.path.exists(filepath):
                folder = os.path.dirname(filepath)
                os.startfile(folder)

    def _update_buttons(self) -> None:
        has_jobs = len(self._verifier.get_jobs()) > 0
        self.btn_start.setEnabled(has_jobs)
        self.btn_remove.setEnabled(has_jobs)
        self.btn_clear.setEnabled(has_jobs)

    def get_verifier(self) -> BatchVerifier:
        return self._verifier
