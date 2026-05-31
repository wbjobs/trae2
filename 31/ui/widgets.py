from PyQt5.QtCore import Qt, pyqtSignal
from PyQt5.QtGui import QColor, QFont, QIcon
from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QSlider,
    QProgressBar, QTableWidget, QTableWidgetItem, QHeaderView,
    QGroupBox, QFormLayout, QDoubleSpinBox, QTextEdit, QFrame,
    QSizePolicy, QComboBox, QCheckBox, QSplitter, QToolBar
)
from PyQt5.QtCore import QSize

from core.service import SimulationService
from collision import CollisionResult
from .batch_panel import BatchPanel
from .recording_panel import RecordingPanel


class SimulationToolbar(QToolBar):
    start_requested = pyqtSignal()
    pause_requested = pyqtSignal()
    stop_requested = pyqtSignal()
    reset_requested = pyqtSignal()
    speed_changed = pyqtSignal(float)

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 2, 10, 2)
        layout.setSpacing(8)

        self.btn_start = QPushButton('Start')
        self.btn_start.setStyleSheet("""
            QPushButton {
                background-color: #4caf50; color: white;
                padding: 6px 16px; border-radius: 4px; font-weight: bold;
            }
            QPushButton:hover { background-color: #66bb6a; }
            QPushButton:disabled { background-color: #555; color: #888; }
        """)
        self.btn_start.setMinimumWidth(80)
        self.btn_start.clicked.connect(self.start_requested.emit)
        layout.addWidget(self.btn_start)

        self.btn_pause = QPushButton('Pause')
        self.btn_pause.setStyleSheet("""
            QPushButton {
                background-color: #ff9800; color: white;
                padding: 6px 16px; border-radius: 4px; font-weight: bold;
            }
            QPushButton:hover { background-color: #ffa726; }
            QPushButton:disabled { background-color: #555; color: #888; }
        """)
        self.btn_pause.setMinimumWidth(80)
        self.btn_pause.clicked.connect(self.pause_requested.emit)
        layout.addWidget(self.btn_pause)

        self.btn_stop = QPushButton('Stop')
        self.btn_stop.setStyleSheet("""
            QPushButton {
                background-color: #e53935; color: white;
                padding: 6px 16px; border-radius: 4px; font-weight: bold;
            }
            QPushButton:hover { background-color: #ef5350; }
            QPushButton:disabled { background-color: #555; color: #888; }
        """)
        self.btn_stop.setMinimumWidth(80)
        self.btn_stop.clicked.connect(self.stop_requested.emit)
        layout.addWidget(self.btn_stop)

        self.btn_reset = QPushButton('Reset')
        self.btn_reset.setStyleSheet("""
            QPushButton {
                background-color: #616161; color: white;
                padding: 6px 16px; border-radius: 4px; font-weight: bold;
            }
            QPushButton:hover { background-color: #757575; }
            QPushButton:disabled { background-color: #555; color: #888; }
        """)
        self.btn_reset.setMinimumWidth(80)
        self.btn_reset.clicked.connect(self.reset_requested.emit)
        layout.addWidget(self.btn_reset)

        layout.addSpacing(20)

        speed_label = QLabel('Speed:')
        speed_label.setStyleSheet('color: #aaa;')
        layout.addWidget(speed_label)

        self.speed_slider = QSlider(Qt.Horizontal)
        self.speed_slider.setRange(1, 100)
        self.speed_slider.setValue(10)
        self.speed_slider.setFixedWidth(150)
        self.speed_slider.valueChanged.connect(self._on_speed_changed)
        layout.addWidget(self.speed_slider)

        self.speed_value = QLabel('1.0x')
        self.speed_value.setStyleSheet('color: #4fc3f7; min-width: 40px;')
        layout.addWidget(self.speed_value)

        layout.addStretch()

        self.set_start_enabled(True)
        self.set_pause_enabled(False)
        self.set_stop_enabled(False)

    def _on_speed_changed(self, value):
        speed = value / 10.0
        self.speed_value.setText(f'{speed:.1f}x')
        self.speed_changed.emit(speed)

    def set_start_enabled(self, enabled: bool):
        self.btn_start.setEnabled(enabled)

    def set_pause_enabled(self, enabled: bool):
        self.btn_pause.setEnabled(enabled)

    def set_stop_enabled(self, enabled: bool):
        self.btn_stop.setEnabled(enabled)

    def set_reset_enabled(self, enabled: bool):
        self.btn_reset.setEnabled(enabled)


class ControlPanel(QWidget):
    def __init__(self, service: SimulationService, parent=None):
        super().__init__(parent)
        self.service = service
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(10)

        pos_group = QGroupBox('Current Position')
        pos_group.setStyleSheet("""
            QGroupBox {
                color: #4fc3f7; border: 1px solid #555;
                border-radius: 6px; margin-top: 12px; padding: 10px;
                font-weight: bold;
            }
            QGroupBox::title {
                subcontrol-origin: margin; left: 10px; padding: 0 5px;
            }
        """)
        pos_layout = QFormLayout(pos_group)
        pos_layout.setSpacing(5)

        self.lbl_x = QLabel('0.000')
        self.lbl_y = QLabel('0.000')
        self.lbl_z = QLabel('0.000')
        for lbl in (self.lbl_x, self.lbl_y, self.lbl_z):
            lbl.setStyleSheet('color: #e0e0e0; font-family: Consolas; font-size: 14px; font-weight: bold;')
            lbl.setMinimumWidth(100)

        pos_layout.addRow('X:', self.lbl_x)
        pos_layout.addRow('Y:', self.lbl_y)
        pos_layout.addRow('Z:', self.lbl_z)

        layout.addWidget(pos_group)

        sim_group = QGroupBox('Simulation Controls')
        sim_group.setStyleSheet("""
            QGroupBox {
                color: #81c784; border: 1px solid #555;
                border-radius: 6px; margin-top: 12px; padding: 10px;
                font-weight: bold;
            }
            QGroupBox::title {
                subcontrol-origin: margin; left: 10px; padding: 0 5px;
            }
        """)
        sim_layout = QVBoxLayout(sim_group)

        self.lbl_progress = QLabel('Progress: 0%')
        self.lbl_progress.setStyleSheet('color: #aaa;')
        sim_layout.addWidget(self.lbl_progress)

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
        self.progress_bar.setFixedHeight(20)
        sim_layout.addWidget(self.progress_bar)

        self.lbl_commands = QLabel('Commands: 0 / 0')
        self.lbl_commands.setStyleSheet('color: #aaa; margin-top: 5px;')
        sim_layout.addWidget(self.lbl_commands)

        self.lbl_path_length = QLabel('Path Length: 0.00 mm')
        self.lbl_path_length.setStyleSheet('color: #aaa;')
        sim_layout.addWidget(self.lbl_path_length)

        layout.addWidget(sim_group)

        opts_group = QGroupBox('Options')
        opts_group.setStyleSheet("""
            QGroupBox {
                color: #ffb74d; border: 1px solid #555;
                border-radius: 6px; margin-top: 12px; padding: 10px;
                font-weight: bold;
            }
            QGroupBox::title {
                subcontrol-origin: margin; left: 10px; padding: 0 5px;
            }
        """)
        opts_layout = QVBoxLayout(opts_group)

        self.chk_collision = QCheckBox('Enable Collision Detection')
        self.chk_collision.setChecked(True)
        self.chk_collision.setStyleSheet('color: #ddd;')
        opts_layout.addWidget(self.chk_collision)

        self.chk_limits = QCheckBox('Enable Limit Checking')
        self.chk_limits.setChecked(True)
        self.chk_limits.setStyleSheet('color: #ddd;')
        opts_layout.addWidget(self.chk_limits)

        opts_layout.addSpacing(10)

        self.btn_report = QPushButton('Generate Report')
        self.btn_report.setStyleSheet("""
            QPushButton {
                background-color: #4fc3f7; color: #1e1e1e;
                padding: 8px; border-radius: 4px; font-weight: bold;
            }
            QPushButton:hover { background-color: #81d4fa; }
        """)
        opts_layout.addWidget(self.btn_report)

        layout.addWidget(opts_group)

        layout.addStretch()

    def update_position(self, position: dict):
        self.lbl_x.setText(f'{position.get("X", 0):.3f}')
        self.lbl_y.setText(f'{position.get("Y", 0):.3f}')
        self.lbl_z.setText(f'{position.get("Z", 0):.3f}')

        if self.service.simulator:
            progress = self.service.get_progress()
            self.progress_bar.setValue(int(progress * 100))
            self.lbl_progress.setText(f'Progress: {progress * 100:.1f}%')
            self.lbl_commands.setText(
                f'Commands: {self.service.simulator.current_command_index} / {len(self.service.commands)}'
            )
            path = self.service.simulator.current_path
            self.lbl_path_length.setText(f'Path Length: {path.total_length:.2f} mm')


class StatusPanel(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)

        title = QLabel('System Status')
        title.setStyleSheet('color: #4fc3f7; font-size: 14px; font-weight: bold;')
        layout.addWidget(title)

        self.log_view = QTextEdit()
        self.log_view.setReadOnly(True)
        self.log_view.setStyleSheet("""
            QTextEdit {
                background-color: #1e1e1e; color: #ddd;
                border: 1px solid #444; border-radius: 6px;
                font-family: Consolas, monospace; font-size: 10px;
            }
        """)
        layout.addWidget(self.log_view, 1)

        btn_layout = QHBoxLayout()
        self.btn_clear = QPushButton('Clear')
        self.btn_clear.setStyleSheet("""
            QPushButton {
                background-color: #555; color: white;
                padding: 4px 12px; border-radius: 4px;
            }
            QPushButton:hover { background-color: #666; }
        """)
        self.btn_clear.clicked.connect(self.clear)
        btn_layout.addWidget(self.btn_clear)
        btn_layout.addStretch()
        layout.addLayout(btn_layout)

    def add_message(self, message: str, level: str = 'info'):
        colors = {
            'info': '#4fc3f7',
            'warning': '#ffb74d',
            'error': '#e57373',
            'success': '#81c784',
        }
        color = colors.get(level, '#ddd')
        prefix = level.upper()
        self.log_view.append(
            f'<span style="color: {color};">[{prefix}]</span> {message}'
        )

        scrollbar = self.log_view.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())

    def clear(self):
        self.log_view.clear()


class CollisionPanel(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)

        title = QLabel('Collision Detection Results')
        title.setStyleSheet('color: #ffb74d; font-size: 14px; font-weight: bold;')
        layout.addWidget(title)

        self.table = QTableWidget()
        self.table.setColumnCount(6)
        self.table.setHorizontalHeaderLabels(['Type', 'Status', 'Distance (mm)', 'X', 'Y', 'Z'])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.table.setStyleSheet("""
            QTableWidget {
                background-color: #252526; color: #ddd;
                gridline-color: #444; border: 1px solid #444;
            }
            QHeaderView::section {
                background-color: #3c3c3c; color: #4fc3f7;
                padding: 6px; border: 1px solid #444; font-weight: bold;
            }
            QTableWidget::item {
                padding: 4px;
            }
            QTableWidget::item:selected {
                background-color: #264f78;
            }
        """)
        self.table.verticalHeader().setVisible(False)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        layout.addWidget(self.table, 1)

        stats_layout = QHBoxLayout()

        self.lbl_collisions = QLabel('Collisions: 0')
        self.lbl_collisions.setStyleSheet('color: #e57373; font-weight: bold;')
        stats_layout.addWidget(self.lbl_collisions)

        self.lbl_warnings = QLabel('Warnings: 0')
        self.lbl_warnings.setStyleSheet('color: #ffb74d; font-weight: bold;')
        stats_layout.addWidget(self.lbl_warnings)

        stats_layout.addStretch()
        layout.addLayout(stats_layout)

    def update_collisions(self, collisions):
        self.table.setRowCount(len(collisions))

        collision_count = 0
        warning_count = 0

        for row, result in enumerate(collisions):
            if result.is_collision:
                collision_count += 1
                status = 'COLLISION'
                color = QColor('#e57373')
            else:
                warning_count += 1
                status = 'WARNING'
                color = QColor('#ffb74d')

            type_item = QTableWidgetItem(result.collision_type.value if result.collision_type else '')
            type_item.setForeground(color)
            type_item.setFont(QFont('Arial', 9, QFont.Bold))

            status_item = QTableWidgetItem(status)
            status_item.setForeground(color)
            status_item.setFont(QFont('Arial', 9, QFont.Bold))
            status_item.setTextAlignment(Qt.AlignCenter)

            dist_item = QTableWidgetItem(f'{result.distance:.4f}')
            dist_item.setForeground(QColor('#ddd'))

            x_item = QTableWidgetItem(f'{result.position[0]:.3f}')
            x_item.setForeground(QColor('#4fc3f7'))

            y_item = QTableWidgetItem(f'{result.position[1]:.3f}')
            y_item.setForeground(QColor('#81c784'))

            z_item = QTableWidgetItem(f'{result.position[2]:.3f}')
            z_item.setForeground(QColor('#e57373'))

            self.table.setItem(row, 0, type_item)
            self.table.setItem(row, 1, status_item)
            self.table.setItem(row, 2, dist_item)
            self.table.setItem(row, 3, x_item)
            self.table.setItem(row, 4, y_item)
            self.table.setItem(row, 5, z_item)

        self.lbl_collisions.setText(f'Collisions: {collision_count}')
        self.lbl_warnings.setText(f'Warnings: {warning_count}')

    def clear(self):
        self.table.setRowCount(0)
        self.lbl_collisions.setText('Collisions: 0')
        self.lbl_warnings.setText('Warnings: 0')


class MachineInfoPanel(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)

        title = QLabel('Machine Information')
        title.setStyleSheet('color: #81c784; font-size: 14px; font-weight: bold;')
        layout.addWidget(title)

        info_group = QGroupBox('Machine Specs')
        info_group.setStyleSheet("""
            QGroupBox {
                color: #81c784; border: 1px solid #555;
                border-radius: 6px; margin-top: 12px; padding: 10px;
                font-weight: bold;
            }
            QGroupBox::title {
                subcontrol-origin: margin; left: 10px; padding: 0 5px;
            }
        """)
        info_layout = QFormLayout(info_group)
        info_layout.setSpacing(8)

        self.lbl_machine_name = QLabel('VMC-850')
        self.lbl_machine_type = QLabel('Vertical Machining Center')
        self.lbl_axes = QLabel('X, Y, Z')
        self.lbl_table_size = QLabel('900 x 550 x 100 mm')
        self.lbl_max_feed = QLabel('10000 mm/min')
        self.lbl_max_spindle = QLabel('12000 RPM')

        for lbl in (self.lbl_machine_name, self.lbl_machine_type,
                     self.lbl_axes, self.lbl_table_size,
                     self.lbl_max_feed, self.lbl_max_spindle):
            lbl.setStyleSheet('color: #e0e0e0; font-family: Consolas;')

        info_layout.addRow('Machine:', self.lbl_machine_name)
        info_layout.addRow('Type:', self.lbl_machine_type)
        info_layout.addRow('Axes:', self.lbl_axes)
        info_layout.addRow('Table Size:', self.lbl_table_size)
        info_layout.addRow('Max Feed:', self.lbl_max_feed)
        info_layout.addRow('Max Spindle:', self.lbl_max_spindle)

        layout.addWidget(info_group)

        axis_group = QGroupBox('Axis Limits')
        axis_group.setStyleSheet("""
            QGroupBox {
                color: #4fc3f7; border: 1px solid #555;
                border-radius: 6px; margin-top: 12px; padding: 10px;
                font-weight: bold;
            }
            QGroupBox::title {
                subcontrol-origin: margin; left: 10px; padding: 0 5px;
            }
        """)
        axis_layout = QFormLayout(axis_group)

        self.lbl_x_range = QLabel('0 - 850 mm')
        self.lbl_y_range = QLabel('0 - 500 mm')
        self.lbl_z_range = QLabel('0 - 500 mm')
        for lbl in (self.lbl_x_range, self.lbl_y_range, self.lbl_z_range):
            lbl.setStyleSheet('color: #ddd; font-family: Consolas;')

        axis_layout.addRow('X Axis:', self.lbl_x_range)
        axis_layout.addRow('Y Axis:', self.lbl_y_range)
        axis_layout.addRow('Z Axis:', self.lbl_z_range)

        layout.addWidget(axis_group)

        layout.addStretch()
