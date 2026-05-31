from PyQt5.QtCore import Qt, pyqtSignal
from PyQt5.QtGui import QColor, QPainter, QPen, QFont
from PyQt5.QtWidgets import (
    QMainWindow, QWidget, QSplitter, QVBoxLayout, QHBoxLayout,
    QStatusBar, QAction, QFileDialog, QMessageBox, QToolBar,
    QLabel, QProgressBar, QTabWidget, QDockWidget, QGroupBox, QCheckBox
)
from PyQt5.QtCore import QTimer

from core.service import SimulationService, ServiceState
from .view_3d import View3D
from .code_editor import GCodeEditor
from .recorder import ScreenRecorder
from .widgets import (
    ControlPanel, StatusPanel, SimulationToolbar,
    CollisionPanel, MachineInfoPanel, BatchPanel, RecordingPanel
)


class MainWindow(QMainWindow):
    file_loaded = pyqtSignal(str)
    simulation_started = pyqtSignal()
    simulation_stopped = pyqtSignal()

    def __init__(self):
        super().__init__()
        self.service = SimulationService()
        self.service.initialize()
        self.service.register_state_callback(self._on_service_state_changed)
        self.service.register_event_callback(self._on_service_event)

        self._recorder: ScreenRecorder | None = None
        self._init_ui()
        self._init_menu()
        self._init_toolbar()
        self._init_dock_widgets()
        self._update_ui_state()

        self._update_timer = QTimer(self)
        self._update_timer.timeout.connect(self._update_visualization)
        self._update_timer.start(50)

    def _init_ui(self):
        self.setWindowTitle('CNC Program Offline Simulation & Verification v2.0')
        self.setMinimumSize(1600, 1000)
        self.resize(1920, 1100)

        central = QWidget()
        self.setCentralWidget(central)

        main_layout = QVBoxLayout(central)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        self.main_tabs = QTabWidget()
        self.main_tabs.setStyleSheet("""
            QTabWidget::pane { border: none; background: #1e1e1e; }
            QTabBar::tab {
                background: #2d2d30; color: #ccc;
                padding: 10px 24px; border: 1px solid #3f3f46;
                border-bottom: none; border-top-left-radius: 6px;
                border-top-right-radius: 6px; margin-right: 2px;
                font-weight: bold; font-size: 12px;
            }
            QTabBar::tab:selected {
                background: #3e3e42; color: #4fc3f7;
                border-bottom: 2px solid #4fc3f7;
            }
            QTabBar::tab:hover:!selected { background: #3a3a3d; }
        """)
        main_layout.addWidget(self.main_tabs)

        self.main_tabs.addTab(self._create_simulation_tab(), '🎯 Single Simulation')
        self.main_tabs.addTab(self._create_batch_tab(), '📦 Batch Verification')

        self.status_bar = QStatusBar()
        self.status_bar.setStyleSheet("""
            QStatusBar { background: #252526; color: #ddd; border-top: 1px solid #3c3c3c; }
            QStatusBar::item { border: none; }
        """)
        self.setStatusBar(self.status_bar)

        self.status_label = QLabel('Ready')
        self.status_label.setStyleSheet('padding-left: 10px;')
        self.progress_bar = QProgressBar()
        self.progress_bar.setMaximumWidth(250)
        self.progress_bar.setVisible(False)
        self.progress_bar.setStyleSheet("""
            QProgressBar {
                border: 1px solid #555; border-radius: 4px;
                text-align: center; color: white; background: #2d2d2d;
                height: 18px; margin-right: 10px;
            }
            QProgressBar::chunk {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #4fc3f7, stop:1 #81c784);
                border-radius: 3px;
            }
        """)
        self.status_bar.addWidget(self.status_label, 1)
        self.status_bar.addPermanentWidget(self.progress_bar)

        self.main_tabs.currentChanged.connect(self._on_tab_changed)

    def _create_simulation_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(8)

        splitter_main = QSplitter(Qt.Horizontal)
        splitter_main.setStyleSheet("""
            QSplitter::handle { background: #3c3c3c; }
            QSplitter::handle:horizontal { width: 3px; }
            QSplitter::handle:vertical { height: 3px; }
            QSplitter::handle:hover { background: #4fc3f7; }
        """)
        layout.addWidget(splitter_main, 1)

        left_container = QWidget()
        left_layout = QVBoxLayout(left_container)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(6)

        self.view_3d = View3D(self.service)
        left_layout.addWidget(self.view_3d, 1)

        self.recording_panel = RecordingPanel()
        left_layout.addWidget(self.recording_panel)

        splitter_main.addWidget(left_container)

        right_container = QWidget()
        right_layout = QVBoxLayout(right_container)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(6)

        editor_group = QGroupBox('G-Code Editor')
        editor_group.setStyleSheet("""
            QGroupBox {
                color: #81c784; border: 1px solid #444;
                border-radius: 6px; margin-top: 10px; padding: 8px;
                font-weight: bold; font-size: 12px;
            }
            QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 8px; }
        """)
        editor_layout = QVBoxLayout(editor_group)
        editor_layout.setContentsMargins(8, 12, 8, 8)

        self.code_editor = GCodeEditor()
        editor_layout.addWidget(self.code_editor)

        right_layout.addWidget(editor_group, 1)

        self.right_tabs = QTabWidget()
        self.right_tabs.setStyleSheet("""
            QTabWidget::pane { border: 1px solid #444; border-radius: 6px; background: #1e1e1e; }
            QTabBar::tab {
                background: #2d2d30; color: #ccc; padding: 8px 16px;
                border: 1px solid #444; border-bottom: none;
                border-top-left-radius: 4px; border-top-right-radius: 4px;
                margin-right: 2px; font-size: 11px;
            }
            QTabBar::tab:selected { background: #3e3e42; color: #4fc3f7; }
            QTabBar::tab:hover:!selected { background: #3a3a3d; }
        """)

        self.control_panel = ControlPanel(self.service)
        self.status_panel = StatusPanel()
        self.collision_panel = CollisionPanel()
        self.machine_panel = MachineInfoPanel()

        self.right_tabs.addTab(self.control_panel, '⚙ Control')
        self.right_tabs.addTab(self.collision_panel, '⚠ Collisions')
        self.right_tabs.addTab(self.machine_panel, '🖥 Machine')
        self.right_tabs.addTab(self.status_panel, '📋 Status')

        right_layout.addWidget(self.right_tabs, 1)

        splitter_main.addWidget(right_container)
        splitter_main.setStretchFactor(0, 3)
        splitter_main.setStretchFactor(1, 2)
        splitter_main.setSizes([1100, 700])

        return tab

    def _create_batch_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(8)

        self.batch_panel = BatchPanel()
        layout.addWidget(self.batch_panel)

        self.batch_panel.batch_started.connect(self._on_batch_started)
        self.batch_panel.batch_completed.connect(self._on_batch_completed)

        return tab

    def _init_menu(self):
        menubar = self.menuBar()
        menubar.setStyleSheet("""
            QMenuBar { background: #252526; color: #ddd; }
            QMenuBar::item { padding: 6px 16px; background: transparent; }
            QMenuBar::item:selected { background: #3e3e42; color: #4fc3f7; }
            QMenu {
                background: #252526; color: #ddd;
                border: 1px solid #444; padding: 4px;
            }
            QMenu::item { padding: 6px 30px; border-radius: 4px; }
            QMenu::item:selected { background: #264f78; }
        """)

        file_menu = menubar.addMenu('&File')

        open_action = QAction('&Open G-Code File...', self)
        open_action.setShortcut('Ctrl+O')
        open_action.triggered.connect(self._on_open_file)
        file_menu.addAction(open_action)

        save_action = QAction('&Save G-Code...', self)
        save_action.setShortcut('Ctrl+S')
        save_action.triggered.connect(self._on_save_file)
        file_menu.addAction(save_action)

        file_menu.addSeparator()

        load_sample_action = QAction('Load &Sample Program', self)
        load_sample_action.triggered.connect(self._on_load_sample)
        file_menu.addAction(load_sample_action)

        file_menu.addSeparator()

        batch_open_action = QAction('Batch &Add Files...', self)
        batch_open_action.setShortcut('Ctrl+Shift+O')
        batch_open_action.triggered.connect(lambda: self.main_tabs.setCurrentIndex(1))
        file_menu.addAction(batch_open_action)

        file_menu.addSeparator()

        exit_action = QAction('E&xit', self)
        exit_action.setShortcut('Ctrl+Q')
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)

        sim_menu = menubar.addMenu('&Simulation')

        start_action = QAction('&Start Simulation', self)
        start_action.setShortcut('F5')
        start_action.triggered.connect(self._on_start_simulation)
        sim_menu.addAction(start_action)

        pause_action = QAction('P&ause Simulation', self)
        pause_action.setShortcut('F6')
        pause_action.triggered.connect(self._on_pause_simulation)
        sim_menu.addAction(pause_action)

        stop_action = QAction('S&top Simulation', self)
        stop_action.setShortcut('Shift+F5')
        stop_action.triggered.connect(self._on_stop_simulation)
        sim_menu.addAction(stop_action)

        sim_menu.addSeparator()

        reset_action = QAction('&Reset Simulation', self)
        reset_action.setShortcut('Ctrl+R')
        reset_action.triggered.connect(self._on_reset_simulation)
        sim_menu.addAction(reset_action)

        recording_menu = menubar.addMenu('&Recording')

        start_rec_action = QAction('&Start Recording', self)
        start_rec_action.setShortcut('Ctrl+Shift+R')
        start_rec_action.triggered.connect(lambda: self.recording_panel._on_record_clicked())
        recording_menu.addAction(start_rec_action)

        stop_rec_action = QAction('S&top Recording', self)
        stop_rec_action.setShortcut('Ctrl+Shift+S')
        stop_rec_action.triggered.connect(lambda: self.recording_panel._on_stop_clicked())
        recording_menu.addAction(stop_rec_action)

        report_menu = menubar.addMenu('&Report')

        gen_report_action = QAction('&Generate Verification Report...', self)
        gen_report_action.setShortcut('Ctrl+G')
        gen_report_action.triggered.connect(self._on_generate_report)
        report_menu.addAction(gen_report_action)

        view_menu = menubar.addMenu('&View')

        show_grid_action = QAction('Show &Grid', self)
        show_grid_action.setCheckable(True)
        show_grid_action.setChecked(True)
        show_grid_action.toggled.connect(self.view_3d.set_grid_visible)
        view_menu.addAction(show_grid_action)

        show_axes_action = QAction('Show A&xes', self)
        show_axes_action.setCheckable(True)
        show_axes_action.setChecked(True)
        show_axes_action.toggled.connect(self.view_3d.set_axes_visible)
        view_menu.addAction(show_axes_action)

        show_path_action = QAction('Show Tool &Path', self)
        show_path_action.setCheckable(True)
        show_path_action.setChecked(True)
        show_path_action.toggled.connect(self.view_3d.set_path_visible)
        view_menu.addAction(show_path_action)

        help_menu = menubar.addMenu('&Help')

        about_action = QAction('&About', self)
        about_action.triggered.connect(self._on_about)
        help_menu.addAction(about_action)

    def _init_toolbar(self):
        self.toolbar = SimulationToolbar()
        self.toolbar.setMovable(False)
        self.toolbar.setStyleSheet("""
            QToolBar { background: #2d2d30; border: none; padding: 4px; spacing: 6px; }
            QToolBar::separator { background: #3c3c3c; width: 1px; margin: 4px 8px; }
        """)
        self.addToolBar(self.toolbar)

        self.toolbar.start_requested.connect(self._on_start_simulation)
        self.toolbar.pause_requested.connect(self._on_pause_simulation)
        self.toolbar.stop_requested.connect(self._on_stop_simulation)
        self.toolbar.reset_requested.connect(self._on_reset_simulation)
        self.toolbar.speed_changed.connect(self.service.set_simulation_speed)

    def _init_dock_widgets(self):
        self._recorder = ScreenRecorder(self.view_3d)
        self.recording_panel.set_recorder(self._recorder)
        self.recording_panel.set_target_widget(self.view_3d)

    def _update_ui_state(self):
        state = self.service.state
        is_idle = state in (ServiceState.IDLE, ServiceState.PARSED, ServiceState.COMPLETED)
        is_running = state == ServiceState.SIMULATING
        is_paused = state == ServiceState.PAUSED
        is_parsed = state in (ServiceState.PARSED, ServiceState.SIMULATING,
                              ServiceState.PAUSED, ServiceState.COMPLETED)

        self.toolbar.set_start_enabled(is_parsed and not is_running)
        self.toolbar.set_pause_enabled(is_running)
        self.toolbar.set_stop_enabled(is_running or is_paused)
        self.toolbar.set_reset_enabled(not is_idle or True)

    def _on_tab_changed(self, index: int) -> None:
        if index == 0:
            pass
        elif index == 1:
            pass

    def _on_open_file(self):
        filepath, _ = QFileDialog.getOpenFileName(
            self, 'Open G-Code File', '',
            'G-Code Files (*.nc *.tap *.gcode *.txt *.cnc);;All Files (*.*)'
        )
        if filepath:
            success = self.service.load_gcode_file(filepath)
            if success:
                with open(filepath, 'r', encoding='utf-8') as f:
                    self.code_editor.set_text(f.read())
                self.code_editor.set_editable(False)
                self.file_loaded.emit(filepath)
                self.status_label.setText(f'Loaded: {filepath}')
                self.view_3d.refresh()
                self.main_tabs.setCurrentIndex(0)
            else:
                QMessageBox.warning(self, 'Error', 'Failed to parse G-Code file')

    def _on_save_file(self):
        filepath, _ = QFileDialog.getSaveFileName(
            self, 'Save G-Code File', '',
            'G-Code Files (*.nc *.tap *.gcode);;All Files (*.*)'
        )
        if filepath:
            text = self.code_editor.get_text()
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(text)
            self.status_label.setText(f'Saved: {filepath}')

    def _on_load_sample(self):
        import os
        sample_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                   'data', 'samples')
        sample_file = os.path.join(sample_dir, 'sample_milling.nc')

        if os.path.exists(sample_file):
            success = self.service.load_gcode_file(sample_file)
            if success:
                with open(sample_file, 'r', encoding='utf-8') as f:
                    self.code_editor.set_text(f.read())
                self.code_editor.set_editable(False)
                self.status_label.setText('Loaded sample program')
                self.view_3d.refresh()
            else:
                QMessageBox.warning(self, 'Error', 'Failed to load sample')
        else:
            QMessageBox.warning(self, 'Not Found', 'Sample file not found')

    def _on_start_simulation(self):
        if self.service.state == ServiceState.IDLE:
            text = self.code_editor.get_text()
            if text.strip():
                self.service.load_gcode_text(text)
        self.service.start_simulation()
        self.simulation_started.emit()

    def _on_pause_simulation(self):
        self.service.pause_simulation()

    def _on_stop_simulation(self):
        self.service.stop_simulation()
        self.simulation_stopped.emit()

    def _on_reset_simulation(self):
        self.service.reset_simulation()
        self.view_3d.refresh()
        self.collision_panel.clear()
        self.status_panel.clear()

    def _on_generate_report(self):
        output_dir = QFileDialog.getExistingDirectory(
            self, 'Select Report Output Directory', './reports'
        )
        if output_dir:
            filepath = self.service.generate_report('html', output_dir)
            if filepath:
                QMessageBox.information(
                    self, 'Report Generated',
                    f'Verification report saved to:\n{filepath}'
                )
            else:
                QMessageBox.warning(self, 'Error', 'Failed to generate report')

    def _on_about(self):
        QMessageBox.about(
            self, 'About',
            'CNC Program Offline Simulation & Verification\n'
            'Version 2.0.0\n\n'
            'Features:\n'
            '  • G-code parsing (including non-standard formats)\n'
            '  • 3-axis machining center simulation\n'
            '  • Linear and circular interpolation\n'
            '  • Collision detection and warning system\n'
            '  • Batch verification mode\n'
            '  • Simulation recording (PNG/JPEG/WebP sequences)\n'
            '  • HTML verification report generation'
        )

    def _on_service_state_changed(self, state):
        state_text = state.value.replace('_', ' ').title()
        self.status_label.setText(state_text)

        if state == ServiceState.SIMULATING:
            self.progress_bar.setVisible(True)
            self.progress_bar.setRange(0, 0)
        elif state == ServiceState.COMPLETED:
            self.progress_bar.setRange(0, 100)
            self.progress_bar.setValue(100)
            self._refresh_all_panels()
        else:
            self.progress_bar.setVisible(False)

        self._update_ui_state()

    def _on_service_event(self, event):
        event_type = event.get('type', '')
        if event_type == 'position_update':
            pos = event.get('data', {}).get('position', {})
            self.view_3d.update_position(pos)
        elif event_type == 'limit_violation':
            self.status_panel.add_message(
                f"LIMIT: {event.get('data', {}).get('axis', '')} axis {event.get('data', {}).get('limit_type', '')}",
                'warning'
            )
        elif event_type == 'error':
            self.status_panel.add_message(event.get('message', ''), 'error')

    def _update_visualization(self):
        if self.service.state == ServiceState.SIMULATING:
            progress = self.service.get_progress()
            self.progress_bar.setRange(0, 100)
            self.progress_bar.setValue(int(progress * 100))

            collisions = self.service.collision_results
            self.collision_panel.update_collisions(collisions)

            pos = self.service.get_current_position()
            self.control_panel.update_position(pos)

            self.view_3d.update_position(pos)

    def _refresh_all_panels(self):
        self.view_3d.refresh()
        self.collision_panel.update_collisions(self.service.collision_results)
        self.control_panel.update_position(self.service.get_current_position())

        if self.service.report_data:
            data = self.service.report_data
            self.status_panel.add_message(
                f'Simulation completed: {data.total_commands} commands, '
                f'{data.total_path_length:.2f}mm path',
                'info'
            )

    def _on_batch_started(self):
        self.status_label.setText('Batch verification started...')
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 0)

    def _on_batch_completed(self, result):
        self.progress_bar.setVisible(False)
        self.status_label.setText(
            f'Batch complete: {result.completed_jobs}/{result.total_jobs} passed, '
            f'{result.failed_jobs} failed, {result.total_collisions} collisions'
        )
