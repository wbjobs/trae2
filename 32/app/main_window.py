"""Main PyQt5 UI for the Stage Lighting Central Control Desktop App.

The UI composes the project editor, scene editor, timeline, simulator preview,
preset library, and scene arranger so the user can edit lighting scenes, apply
presets, auto-arrange scenes, and preview them in the built-in simulator.
"""
from __future__ import annotations

import os
import sys
from typing import Dict, List, Optional, Tuple

from PyQt5 import QtCore, QtGui, QtWidgets

from .device_simulator import ExternalSimulator, InternalSimulator
from .editor.scene_editor import SceneEditor
from .models import FixtureState, Project, Scene
from .preset_library import PresetLibrary
from .project_file import ProjectCryptoError, ProjectFile
from .scene_arranger import ArrangeStrategy, SceneArranger
from .timeline import TimelineController, TimelineState
from .trajectory import TrajectoryEngine


COLOR_ORDER = ["r", "g", "b", "w", "a", "dimmer"]


# --------------------------------------------------------- simulator preview
class SimulatorPreview(QtWidgets.QWidget):
    """Optimized canvas that draws fixture beams with caching and throttled repaints."""

    frameReady = QtCore.pyqtSignal()

    def __init__(self, simulator: InternalSimulator, parent=None):
        super().__init__(parent)
        self.simulator = simulator
        self.setMinimumSize(480, 320)
        self.setAutoFillBackground(True)
        self._bg_color = QtGui.QColor("#111418")
        self._text_color = QtGui.QColor("#606870")
        self._body_brush = QtGui.QBrush(QtGui.QColor("#2b3440"))
        self._body_pen = QtGui.QPen(QtGui.QColor("#3a4856"))
        self._label_pen = QtGui.QPen(QtGui.QColor("#cfd6df"))
        self._grad_cache: Dict[str, QtGui.QRadialGradient] = {}
        self._pos_cache: Dict[str, Tuple[float, float]] = {}
        self._last_colors: Dict[str, Tuple[int, int, int]] = {}
        self._pending_update = False
        self._throttle_timer = QtCore.QTimer(self)
        self._throttle_timer.setSingleShot(True)
        self._throttle_timer.timeout.connect(self._do_update)
        self._throttle_ms = 16  # ~60fps max
        self._font = QtGui.QFont()
        self._font.setPointSize(9)
        simulator.register_listener(self._on_sim_update)
        self.frameReady.connect(self._schedule_update)

    def _on_sim_update(self, _snapshot):
        self.frameReady.emit()

    def _schedule_update(self):
        if not self._pending_update:
            self._pending_update = True
            self._throttle_timer.start(self._throttle_ms)

    def _do_update(self):
        self._pending_update = False
        self.update()

    def paintEvent(self, _event):
        painter = QtGui.QPainter(self)
        painter.setRenderHint(QtGui.QPainter.Antialiasing, True)
        painter.fillRect(self.rect(), self._bg_color)
        fixtures = list(self.simulator.fixtures.values())
        if not fixtures:
            painter.setPen(self._text_color)
            painter.drawText(self.rect(), QtCore.Qt.AlignCenter,
                             "No fixtures defined - add a rig to preview")
            return
        n = len(fixtures)
        w, h = self.width(), self.height()
        margin = 30
        cell_w = (w - 2 * margin) / n
        beam_radius_h = h * 0.9
        beam_radius_w = cell_w * 0.9
        cy = h * 0.25
        painter.setFont(self._font)
        for i, sf in enumerate(fixtures):
            fid = sf.definition.id
            cx = margin + cell_w * (i + 0.5)
            self._pos_cache[fid] = (cx, cy)
            r, g, b = sf.rgb
            color_key = f"{r}_{g}_{b}"
            if color_key not in self._grad_cache:
                color = QtGui.QColor(r, g, b)
                grad = QtGui.QRadialGradient(cx, cy, max(cell_w, h * 0.7))
                grad.setColorAt(0.0, color)
                grad.setColorAt(0.6, color.lighter(110))
                grad.setColorAt(1.0, QtGui.QColor(0, 0, 0, 0))
                self._grad_cache[color_key] = grad
            else:
                self._grad_cache[color_key].setCenter(cx, cy)
                self._grad_cache[color_key].setRadius(max(cell_w, h * 0.7))
            painter.setBrush(self._grad_cache[color_key])
            painter.setPen(QtCore.Qt.NoPen)
            painter.drawEllipse(QtCore.QPointF(cx, cy), beam_radius_w, beam_radius_h)
            painter.setBrush(self._body_brush)
            painter.setPen(self._body_pen)
            painter.drawEllipse(QtCore.QPointF(cx, cy), 22, 22)
            painter.setPen(self._label_pen)
            painter.drawText(QtCore.QRectF(cx - cell_w / 2, cy + 22,
                                           cell_w, 24),
                             QtCore.Qt.AlignHCenter | QtCore.Qt.AlignTop,
                             sf.definition.name or fid)
        # Trim cache if it gets too large
        if len(self._grad_cache) > 256:
            self._grad_cache.clear()

    def clear_cache(self):
        self._grad_cache.clear()
        self._pos_cache.clear()
        self._last_colors.clear()
        self.update()


# ------------------------------------------------------ scene list panel
class SceneListPanel(QtWidgets.QListWidget):
    """Double-click a scene to jump to its cue time on the timeline."""

    sceneActivated = QtCore.pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.itemDoubleClicked.connect(self._on_double_clicked)

    def _on_double_clicked(self, item: QtWidgets.QListWidgetItem):
        sid = item.data(QtCore.Qt.UserRole)
        if sid:
            self.sceneActivated.emit(sid)


# ------------------------------------------------------ fixture editor grid
class FixtureEditorGrid(QtWidgets.QWidget):
    """Sliders for channels of one fixture in one scene."""

    valueChanged = QtCore.pyqtSignal(str, str, float)  # fixture, channel, value

    def __init__(self, parent=None):
        super().__init__(parent)
        self._sliders: Dict[str, QtWidgets.QSlider] = {}
        self._labels: Dict[str, QtWidgets.QLabel] = {}
        layout = QtWidgets.QFormLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        self._layout = layout
        self._current_fixture_id: Optional[str] = None
        self._current_channels: List[str] = []
        self.setChannels([])

    def setChannels(self, channels: List[str], fixture_id: Optional[str] = None):
        self._current_fixture_id = fixture_id
        self._current_channels = list(channels)
        while self._layout.rowCount():
            self._layout.removeRow(0)
        self._sliders.clear()
        self._labels.clear()
        for ch in channels:
            slider = QtWidgets.QSlider(QtCore.Qt.Horizontal)
            slider.setRange(0, 255)
            slider.setTickPosition(QtWidgets.QSlider.TicksBelow)
            slider.valueChanged.connect(lambda v, c=ch: self._on_value(c, v))
            label = QtWidgets.QLabel("0")
            label.setMinimumWidth(30)
            label.setAlignment(QtCore.Qt.AlignRight | QtCore.Qt.AlignVCenter)
            row = QtWidgets.QHBoxLayout()
            row.addWidget(slider)
            row.addWidget(label)
            wrapper = QtWidgets.QWidget()
            wrapper.setLayout(row)
            self._layout.addRow(ch.upper(), wrapper)
            self._sliders[ch] = slider
            self._labels[ch] = label

    def setState(self, state: Optional[FixtureState]):
        if state is None:
            return
        for ch, slider in self._sliders.items():
            v = int(state.channels.get(ch, 0.0))
            slider.blockSignals(True)
            slider.setValue(max(0, min(255, v)))
            slider.blockSignals(False)
            if ch in self._labels:
                self._labels[ch].setText(str(v))

    def _on_value(self, channel: str, value: int):
        label = self._labels.get(channel)
        if label is not None:
            label.setText(str(value))
        if self._current_fixture_id:
            self.valueChanged.emit(self._current_fixture_id, channel, float(value))


# ----------------------------------------------------------- main window
class MainWindow(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Stage Lighting Console")
        self.resize(1280, 800)

        self.project = Project()
        self.editor = SceneEditor(self.project)
        self.presets = PresetLibrary(self.project)
        self.arranger = SceneArranger(self.project)
        self.engine = TrajectoryEngine(self.project, mode="linear")
        self.simulator = InternalSimulator(self.project)
        self.external = ExternalSimulator()
        self.timeline = TimelineController(self.engine, self.simulator,
                                           external=self.external, fps=30)
        self.timeline.add_listener(self._on_tick)
        self.file_manager = ProjectFile()
        self.current_file: Optional[str] = None
        self.current_scene_id: Optional[str] = None
        self.current_fixture_id: Optional[str] = None

        self._build_ui()
        self._build_menu()
        self._populate_scene_list()

    # ---------------------------------------------------------- UI construction
    def _build_ui(self):
        central = QtWidgets.QWidget(self)
        self.setCentralWidget(central)
        root = QtWidgets.QHBoxLayout(central)

        # Left: scene list + project panel
        left = QtWidgets.QVBoxLayout()
        root.addLayout(left, 1)

        left.addWidget(QtWidgets.QLabel("<b>Scenes</b>"))
        self.scene_list = SceneListPanel()
        self.scene_list.sceneActivated.connect(self._jump_to_scene)
        self.scene_list.itemSelectionChanged.connect(self._on_scene_selected)
        left.addWidget(self.scene_list, 2)

        scene_buttons = QtWidgets.QHBoxLayout()
        btn_add_scene = QtWidgets.QPushButton("Add Scene")
        btn_rm_scene = QtWidgets.QPushButton("Remove")
        btn_add_scene.clicked.connect(self._add_scene)
        btn_rm_scene.clicked.connect(self._remove_scene)
        scene_buttons.addWidget(btn_add_scene)
        scene_buttons.addWidget(btn_rm_scene)
        left.addLayout(scene_buttons)

        left.addWidget(QtWidgets.QLabel("<b>Rig</b>"))
        self.rig_list = QtWidgets.QListWidget()
        self.rig_list.itemSelectionChanged.connect(self._on_fixture_selected)
        left.addWidget(self.rig_list, 2)
        rig_buttons = QtWidgets.QHBoxLayout()
        btn_add_fx = QtWidgets.QPushButton("Add Fixture")
        btn_rm_fx = QtWidgets.QPushButton("Remove")
        btn_add_fx.clicked.connect(self._add_fixture)
        btn_rm_fx.clicked.connect(self._remove_fixture)
        rig_buttons.addWidget(btn_add_fx)
        rig_buttons.addWidget(btn_rm_fx)
        left.addLayout(rig_buttons)

        # Presets and Scene Arranger tabs
        tools_tab = QtWidgets.QTabWidget()
        tools_tab.setMaximumHeight(300)

        # Preset Library tab
        preset_widget = QtWidgets.QWidget()
        preset_layout = QtWidgets.QVBoxLayout(preset_widget)
        preset_layout.addWidget(QtWidgets.QLabel("<b>Effect Presets</b>"))

        preset_filter = QtWidgets.QComboBox()
        preset_filter.addItems(["All", "Color", "Intensity", "Position", "Effect"])
        preset_filter.currentIndexChanged.connect(self._filter_presets)
        preset_layout.addWidget(preset_filter)

        self.preset_list = QtWidgets.QListWidget()
        self.preset_list.itemDoubleClicked.connect(self._apply_preset_to_scene)
        preset_layout.addWidget(self.preset_list, 1)

        preset_btn_layout = QtWidgets.QHBoxLayout()
        btn_apply_preset = QtWidgets.QPushButton("Apply")
        btn_apply_preset.clicked.connect(self._apply_preset_to_scene)
        preset_btn_layout.addWidget(btn_apply_preset)
        preset_layout.addLayout(preset_btn_layout)

        tools_tab.addTab(preset_widget, "Presets")

        # Scene Arranger tab
        arrange_widget = QtWidgets.QWidget()
        arrange_layout = QtWidgets.QVBoxLayout(arrange_widget)
        arrange_layout.addWidget(QtWidgets.QLabel("<b>Auto Arrange</b>"))

        arrange_layout.addWidget(QtWidgets.QLabel("Mode:"))
        self.arrange_mode = QtWidgets.QComboBox()
        self.arrange_mode.addItems([
            "Randomize", "Sequence", "Wave", "Gradient", "Chase"
        ])
        arrange_layout.addWidget(self.arrange_mode)

        arrange_layout.addWidget(QtWidgets.QLabel("Scene Count:"))
        self.arrange_count = QtWidgets.QSpinBox()
        self.arrange_count.setRange(1, 100)
        self.arrange_count.setValue(4)
        arrange_layout.addWidget(self.arrange_count)

        arrange_layout.addWidget(QtWidgets.QLabel("Duration (s):"))
        self.arrange_duration = QtWidgets.QDoubleSpinBox()
        self.arrange_duration.setRange(0.1, 600.0)
        self.arrange_duration.setValue(3.0)
        arrange_layout.addWidget(self.arrange_duration)

        arrange_layout.addWidget(QtWidgets.QLabel("Intensity:"))
        self.arrange_intensity = QtWidgets.QDoubleSpinBox()
        self.arrange_intensity.setRange(0.1, 1.0)
        self.arrange_intensity.setSingleStep(0.1)
        self.arrange_intensity.setValue(1.0)
        arrange_layout.addWidget(self.arrange_intensity)

        self.arrange_replace = QtWidgets.QCheckBox("Replace existing scenes")
        arrange_layout.addWidget(self.arrange_replace)

        btn_arrange = QtWidgets.QPushButton("Generate Scenes")
        btn_arrange.clicked.connect(self._auto_arrange_scenes)
        arrange_layout.addWidget(btn_arrange)

        arrange_layout.addStretch(1)

        tools_tab.addTab(arrange_widget, "Arrange")

        left.addWidget(tools_tab, 2)

        self._populate_preset_list()

        # Center: editor + simulator preview
        center = QtWidgets.QVBoxLayout()
        root.addLayout(center, 3)
        self.sim_preview = SimulatorPreview(self.simulator)
        center.addWidget(self.sim_preview, 3)

        editor_box = QtWidgets.QGroupBox("Fixture Channel Editor")
        editor_layout = QtWidgets.QHBoxLayout(editor_box)
        self.fixture_selector = QtWidgets.QComboBox()
        self.fixture_selector.currentIndexChanged.connect(self._on_fixture_combo_changed)
        editor_layout.addWidget(QtWidgets.QLabel("Fixture:"))
        editor_layout.addWidget(self.fixture_selector, 1)
        self.fixture_editor = FixtureEditorGrid()
        self.fixture_editor.valueChanged.connect(self._on_channel_changed)
        editor_layout.addWidget(self.fixture_editor, 2)
        center.addWidget(editor_box, 2)

        scene_meta = QtWidgets.QGroupBox("Scene Properties")
        meta_layout = QtWidgets.QFormLayout(scene_meta)
        self.scene_name_edit = QtWidgets.QLineEdit()
        self.scene_cue_edit = QtWidgets.QDoubleSpinBox()
        self.scene_cue_edit.setRange(0.0, 86400.0)
        self.scene_cue_edit.setDecimals(2)
        self.scene_dur_edit = QtWidgets.QDoubleSpinBox()
        self.scene_dur_edit.setRange(0.1, 3600.0)
        self.scene_dur_edit.setDecimals(2)
        self.scene_fade_edit = QtWidgets.QDoubleSpinBox()
        self.scene_fade_edit.setRange(0.0, 3600.0)
        self.scene_fade_edit.setDecimals(2)
        self.scene_name_edit.editingFinished.connect(self._apply_scene_meta)
        self.scene_cue_edit.editingFinished.connect(self._apply_scene_meta)
        self.scene_dur_edit.editingFinished.connect(self._apply_scene_meta)
        self.scene_fade_edit.editingFinished.connect(self._apply_scene_meta)
        meta_layout.addRow("Name", self.scene_name_edit)
        meta_layout.addRow("Cue Time (s)", self.scene_cue_edit)
        meta_layout.addRow("Duration (s)", self.scene_dur_edit)
        meta_layout.addRow("Fade (s)", self.scene_fade_edit)
        center.addWidget(scene_meta, 1)

        # Bottom: timeline controls
        timeline_box = QtWidgets.QGroupBox("Timeline")
        tlayout = QtWidgets.QVBoxLayout(timeline_box)
        row1 = QtWidgets.QHBoxLayout()
        self.btn_play = QtWidgets.QPushButton("Play")
        self.btn_pause = QtWidgets.QPushButton("Pause")
        self.btn_stop = QtWidgets.QPushButton("Stop")
        self.chk_loop = QtWidgets.QCheckBox("Loop")
        self.speed_spin = QtWidgets.QDoubleSpinBox()
        self.speed_spin.setRange(0.1, 4.0)
        self.speed_spin.setSingleStep(0.1)
        self.speed_spin.setValue(1.0)
        self.btn_play.clicked.connect(self.timeline.play)
        self.btn_pause.clicked.connect(self.timeline.pause)
        self.btn_stop.clicked.connect(self.timeline.stop)
        self.chk_loop.toggled.connect(self.timeline.set_loop)
        self.speed_spin.valueChanged.connect(self.timeline.set_speed)
        for w in [self.btn_play, self.btn_pause, self.btn_stop, self.chk_loop,
                  QtWidgets.QLabel("Speed"), self.speed_spin]:
            row1.addWidget(w)
        row1.addStretch(1)
        self.time_label = QtWidgets.QLabel("0.00 / 0.00 s")
        row1.addWidget(self.time_label)
        tlayout.addLayout(row1)

        self.timeline_slider = QtWidgets.QSlider(QtCore.Qt.Horizontal)
        self.timeline_slider.setRange(0, 1000)
        self.timeline_slider.sliderMoved.connect(self._on_timeline_slider)
        tlayout.addWidget(self.timeline_slider)

        center.addWidget(timeline_box, 1)

        # Right: external simulator panel
        right = QtWidgets.QGroupBox("External Simulator")
        rlayout = QtWidgets.QFormLayout(right)
        self.ex_host = QtWidgets.QLineEdit("127.0.0.1")
        self.ex_port = QtWidgets.QSpinBox()
        self.ex_port.setRange(1, 65535)
        self.ex_port.setValue(9420)
        self.ex_status = QtWidgets.QLabel("Disconnected")
        self.ex_status.setStyleSheet("color:#c05050;")
        btn_connect = QtWidgets.QPushButton("Connect")
        btn_disconnect = QtWidgets.QPushButton("Disconnect")
        btn_connect.clicked.connect(self._connect_external)
        btn_disconnect.clicked.connect(self._disconnect_external)
        rlayout.addRow("Host", self.ex_host)
        rlayout.addRow("Port", self.ex_port)
        rlayout.addRow(btn_connect, btn_disconnect)
        rlayout.addRow("Status", self.ex_status)
        root.addWidget(right, 1)

    def _build_menu(self):
        menu = self.menuBar().addMenu("&Project")
        a_new = menu.addAction("New")
        a_new.setShortcut("Ctrl+N")
        a_new.triggered.connect(self._new_project)
        a_open = menu.addAction("Open...")
        a_open.setShortcut("Ctrl+O")
        a_open.triggered.connect(self._open_project)
        a_save = menu.addAction("Save")
        a_save.setShortcut("Ctrl+S")
        a_save.triggered.connect(self._save_project)
        a_save_as = menu.addAction("Save As...")
        a_save_as.setShortcut("Ctrl+Shift+S")
        a_save_as.triggered.connect(self._save_project_as)
        menu.addSeparator()
        a_validate = menu.addAction("Validate")
        a_validate.triggered.connect(self._validate_project)
        menu.addSeparator()
        a_quit = menu.addAction("Quit")
        a_quit.setShortcut("Ctrl+Q")
        a_quit.triggered.connect(self.close)

    # ------------------------------------------------------ scene / fixture mgmt
    def _add_scene(self):
        name, ok = QtWidgets.QInputDialog.getText(self, "New Scene", "Scene name:")
        if not ok:
            return
        name = name.strip() or "Scene"
        last_cue = 0.0
        if self.project.scenes:
            last = self.project.scenes[-1]
            last_cue = last.cue_time + last.duration
        scene = self.editor.add_scene(name=name, cue_time=last_cue)
        self.current_scene_id = scene.id
        self._populate_scene_list()
        self._rebuild_engine()

    def _remove_scene(self):
        if not self.current_scene_id:
            return
        if self.editor.remove_scene(self.current_scene_id):
            self.current_scene_id = None
            self._populate_scene_list()
            self._rebuild_engine()

    def _add_fixture(self):
        name, ok = QtWidgets.QInputDialog.getText(self, "New Fixture", "Fixture name:")
        if not ok or not name.strip():
            return
        fd = self.editor.add_fixture(name=name.strip())
        # Ensure existing scenes cover the new fixture
        for sc in self.project.scenes:
            if fd.id not in sc.fixture_states:
                sc.fixture_states[fd.id] = FixtureState(
                    channels={c: 0.0 for c in fd.channels}
                )
        self._populate_rig()
        self._populate_fixture_combo()
        self.sim_preview.clear_cache()

    def _remove_fixture(self):
        items = self.rig_list.selectedItems()
        if not items:
            return
        fid = items[0].data(QtCore.Qt.UserRole)
        if self.editor.remove_fixture(fid):
            self._populate_rig()
            self._populate_fixture_combo()
            self.sim_preview.clear_cache()

    def _populate_scene_list(self):
        self.scene_list.blockSignals(True)
        self.scene_list.clear()
        for sc in self.project.scenes:
            item = QtWidgets.QListWidgetItem(f"{sc.name}  [{sc.cue_time:.2f}s]")
            item.setData(QtCore.Qt.UserRole, sc.id)
            self.scene_list.addItem(item)
        self.scene_list.blockSignals(False)

    def _populate_rig(self):
        self.rig_list.clear()
        self.fixture_selector.clear()
        for fid, fd in self.project.fixtures.items():
            item = QtWidgets.QListWidgetItem(f"{fd.name} @ DMX {fd.dmx_address}")
            item.setData(QtCore.Qt.UserRole, fid)
            self.rig_list.addItem(item)
            self.fixture_selector.addItem(f"{fd.name} ({fid})", fid)

    def _populate_fixture_combo(self):
        current = self.current_fixture_id
        self.fixture_selector.clear()
        for fid, fd in self.project.fixtures.items():
            self.fixture_selector.addItem(f"{fd.name} ({fid})", fid)
        if current:
            for i in range(self.fixture_selector.count()):
                if self.fixture_selector.itemData(i) == current:
                    self.fixture_selector.setCurrentIndex(i)
                    break

    # ------------------------------------------------------ preset library
    def _populate_preset_list(self, category: str = "All"):
        self.preset_list.clear()
        if category == "All":
            presets = self.presets.list_presets()
        else:
            presets = self.presets.list_by_category(category.lower())
        for preset in presets:
            item = QtWidgets.QListWidgetItem(f"[{preset.category.upper()}] {preset.name}")
            item.setData(QtCore.Qt.UserRole, preset.id)
            self.preset_list.addItem(item)

    def _filter_presets(self, index):
        categories = ["All", "Color", "Intensity", "Position", "Effect"]
        if 0 <= index < len(categories):
            self._populate_preset_list(categories[index])

    def _apply_preset_to_scene(self, *_args):
        if not self.current_scene_id:
            QtWidgets.QMessageBox.warning(self, "No Scene",
                                          "Please select a scene first.")
            return
        items = self.preset_list.selectedItems()
        if not items:
            QtWidgets.QMessageBox.warning(self, "No Preset",
                                          "Please select a preset first.")
            return
        preset_id = items[0].data(QtCore.Qt.UserRole)
        scene = self.editor.get_scene(self.current_scene_id)
        if scene:
            self.presets.apply_to_scene(preset_id, scene)
            self._rebuild_engine()
            self.simulator.apply_snapshot(
                self.engine.sample(self.timeline.state.time)
            )
            self.sim_preview.clear_cache()

    # ------------------------------------------------------ scene arranger
    def _auto_arrange_scenes(self):
        if not self.project.fixtures:
            QtWidgets.QMessageBox.warning(self, "No Fixtures",
                                          "Add at least one fixture first.")
            return
        mode_map = {
            0: "randomize",
            1: "sequence",
            2: "wave",
            3: "gradient",
            4: "chase",
        }
        mode = mode_map.get(self.arrange_mode.currentIndex(), "randomize")
        strategy = ArrangeStrategy(
            mode=mode,
            scene_count=self.arrange_count.value(),
            duration_per_scene=self.arrange_duration.value(),
            fade=max(0.1, self.arrange_duration.value() * 0.3),
            intensity=self.arrange_intensity.value(),
            start_cue_time=0.0,
            random_seed=42,
        )
        new_scenes = self.arranger.apply_and_insert(
            strategy, replace=self.arrange_replace.isChecked()
        )
        self.current_scene_id = None
        self._populate_scene_list()
        self._rebuild_engine()
        self.sim_preview.clear_cache()
        QtWidgets.QMessageBox.information(
            self, "Auto Arrange",
            f"Generated {len(new_scenes)} scenes with '{mode}' mode."
        )

    def _on_scene_selected(self):
        items = self.scene_list.selectedItems()
        if not items:
            return
        sid = items[0].data(QtCore.Qt.UserRole)
        self.current_scene_id = sid
        sc = self.editor.get_scene(sid)
        if sc:
            self.scene_name_edit.blockSignals(True)
            self.scene_name_edit.setText(sc.name)
            self.scene_cue_edit.blockSignals(True)
            self.scene_cue_edit.setValue(sc.cue_time)
            self.scene_dur_edit.blockSignals(True)
            self.scene_dur_edit.setValue(sc.duration)
            self.scene_fade_edit.blockSignals(True)
            self.scene_fade_edit.setValue(sc.fade)
            self.scene_name_edit.blockSignals(False)
            self.scene_cue_edit.blockSignals(False)
            self.scene_dur_edit.blockSignals(False)
            self.scene_fade_edit.blockSignals(False)
        self._refresh_fixture_editor_for_scene()

    def _on_fixture_selected(self):
        items = self.rig_list.selectedItems()
        if not items:
            return
        fid = items[0].data(QtCore.Qt.UserRole)
        self.current_fixture_id = fid
        for i in range(self.fixture_selector.count()):
            if self.fixture_selector.itemData(i) == fid:
                self.fixture_selector.setCurrentIndex(i)
                break
        self._refresh_fixture_editor_for_scene()

    def _on_fixture_combo_changed(self, index):
        if index < 0:
            return
        fid = self.fixture_selector.itemData(index)
        self.current_fixture_id = fid
        self._refresh_fixture_editor_for_scene()

    def _refresh_fixture_editor_for_scene(self):
        if not self.current_scene_id or not self.current_fixture_id:
            return
        fd = self.project.fixtures.get(self.current_fixture_id)
        if not fd:
            self.fixture_editor.setChannels([], None)
            return
        self.fixture_editor.setChannels(fd.channels, self.current_fixture_id)
        state = self.editor.get_fixture_state(self.current_scene_id, self.current_fixture_id)
        self.fixture_editor.setState(state)

    def _on_channel_changed(self, fixture_id: str, channel: str, value: float):
        if not self.current_scene_id:
            return
        state = self.editor.get_fixture_state(self.current_scene_id, fixture_id)
        if state is None:
            return
        state.channels[channel] = value
        state = state.clamp()
        self.editor.set_fixture_state(self.current_scene_id, fixture_id, state.channels)
        self._rebuild_engine()
        self.simulator.apply_snapshot(self.engine.sample(self.timeline.state.time))

    def _apply_scene_meta(self):
        if not self.current_scene_id:
            return
        self.editor.update_scene(
            self.current_scene_id,
            name=self.scene_name_edit.text().strip() or "Scene",
            cue_time=float(self.scene_cue_edit.value()),
            duration=float(self.scene_dur_edit.value()),
            fade=float(self.scene_fade_edit.value()),
        )
        self._populate_scene_list()
        self._rebuild_engine()

    # ------------------------------------------------------ timeline / playback
    def _rebuild_engine(self):
        self.engine.project = self.project
        self.engine.build()
        self.simulator.reload_project(self.project)
        duration = self.engine.total_duration()
        self.timeline_slider.setMaximum(max(1, int(duration * 100)))
        self._update_time_label()

    def _jump_to_scene(self, scene_id: str):
        self.timeline.jump_to_scene(scene_id)

    def _on_tick(self, state: TimelineState):
        # Update UI from the playback thread via signal-safe repaint scheduling
        QtCore.QMetaObject.invokeMethod(self, "_apply_tick_ui", QtCore.Qt.QueuedConnection,
                                         QtCore.Q_ARG(float, state.time),
                                         QtCore.Q_ARG(bool, state.playing),
                                         QtCore.Q_ARG(str, state.current_scene_id or ""))

    @QtCore.pyqtSlot(float, bool, str)
    def _apply_tick_ui(self, t: float, playing: bool, scene_id: str):
        self.timeline_slider.blockSignals(True)
        self.timeline_slider.setValue(int(t * 100))
        self.timeline_slider.blockSignals(False)
        if scene_id and self.current_scene_id != scene_id:
            self.current_scene_id = scene_id
            for i in range(self.scene_list.count()):
                if self.scene_list.item(i).data(QtCore.Qt.UserRole) == scene_id:
                    self.scene_list.setCurrentRow(i)
                    break
        self._update_time_label(t)

    def _update_time_label(self, t: Optional[float] = None):
        if t is None:
            t = self.timeline.state.time
        self.time_label.setText(f"{t:.2f} / {self.engine.total_duration():.2f} s")

    def _on_timeline_slider(self, value: int):
        self.timeline.seek(value / 100.0)
        self._update_time_label(value / 100.0)

    # ------------------------------------------------------ external simulator
    def _connect_external(self):
        self.external.host = self.ex_host.text().strip() or "127.0.0.1"
        self.external.port = int(self.ex_port.value())
        if self.external.connect():
            self.ex_status.setText(f"Connected to {self.external.host}:{self.external.port}")
            self.ex_status.setStyleSheet("color:#50a060;")
        else:
            self.ex_status.setText("Connection failed")
            self.ex_status.setStyleSheet("color:#c05050;")

    def _disconnect_external(self):
        self.external.close()
        self.ex_status.setText("Disconnected")
        self.ex_status.setStyleSheet("color:#c05050;")

    # ------------------------------------------------------ file operations
    def _new_project(self):
        self.project = Project()
        self.editor.project = self.project
        self.presets.project = self.project
        self.arranger.project = self.project
        self.current_scene_id = None
        self.current_fixture_id = None
        self.current_file = None
        self._populate_scene_list()
        self._populate_rig()
        self._rebuild_engine()
        self.sim_preview.clear_cache()
        self.setWindowTitle("Stage Lighting Console")

    def _open_project(self):
        path, _ = QtWidgets.QFileDialog.getOpenFileName(
            self, "Open Project", os.getcwd(), "StageLight Project (*.slp)"
        )
        if not path:
            return
        password = ""
        if self.file_manager.is_encrypted(path):
            password, ok = QtWidgets.QInputDialog.getText(
                self, "Password", "Enter project password:",
                QtWidgets.QLineEdit.Password
            )
            if not ok:
                return
        try:
            project = self.file_manager.load(path, password=password)
        except ProjectCryptoError as exc:
            QtWidgets.QMessageBox.critical(self, "Open failed", str(exc))
            return
        self.project = project
        self.editor.project = project
        self.presets.project = project
        self.arranger.project = project
        self.current_file = path
        self.current_scene_id = None
        self._populate_scene_list()
        self._populate_rig()
        self._rebuild_engine()
        self.sim_preview.clear_cache()
        self.setWindowTitle(f"Stage Lighting Console - {os.path.basename(path)}")

    def _save_project(self):
        if not self.current_file:
            self._save_project_as()
            return
        self._do_save(self.current_file)

    def _save_project_as(self):
        path, _ = QtWidgets.QFileDialog.getSaveFileName(
            self, "Save Project As", os.getcwd(), "StageLight Project (*.slp)"
        )
        if not path:
            return
        if not path.lower().endswith(".slp"):
            path += ".slp"
        self._do_save(path)
        self.current_file = path
        self.setWindowTitle(f"Stage Lighting Console - {os.path.basename(path)}")

    def _do_save(self, path: str):
        password, ok = QtWidgets.QInputDialog.getText(
            self, "Encryption", "Password (leave empty for plain text):",
            QtWidgets.QLineEdit.Password
        )
        if not ok:
            return
        password = password or ""
        try:
            self.file_manager.save(self.project, path, password=password)
        except ProjectCryptoError as exc:
            QtWidgets.QMessageBox.critical(self, "Save failed", str(exc))

    def _validate_project(self):
        problems = self.editor.validate()
        if not problems:
            QtWidgets.QMessageBox.information(self, "Validation", "No problems found.")
            return
        QtWidgets.QMessageBox.warning(self, "Validation", "\n".join(problems))

    # ------------------------------------------------------ shutdown
    def closeEvent(self, event):
        try:
            self.timeline.close()
        except Exception:
            pass
        super().closeEvent(event)


def run():
    app = QtWidgets.QApplication(sys.argv)
    app.setApplicationName("Stage Lighting Console")
    win = MainWindow()
    win.show()
    sys.exit(app.exec_())


if __name__ == "__main__":
    run()
