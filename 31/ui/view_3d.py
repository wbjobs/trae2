import math
from typing import Dict, List, Tuple, Optional

from PyQt5.QtCore import Qt, pyqtSignal, QPointF
from PyQt5.QtGui import QColor, QPainter, QPen, QBrush, QFont, QPainterPath, QLinearGradient
from PyQt5.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLabel, QSlider, QComboBox


class View3D(QWidget):
    position_changed = pyqtSignal(dict)

    def __init__(self, service, parent=None):
        super().__init__(parent)
        self.service = service
        self._grid_visible = True
        self._axes_visible = True
        self._path_visible = True

        self._rotation_x = 35.0
        self._rotation_y = -45.0
        self._zoom = 1.0
        self._pan_x = 0.0
        self._pan_y = 0.0

        self._last_pos = None
        self._current_position = {'X': 0.0, 'Y': 0.0, 'Z': 0.0}
        self._path_points: List[Dict[str, float]] = []

        self._init_ui()
        self.setMinimumSize(400, 400)
        self.setMouseTracking(True)

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        top_bar = QHBoxLayout()
        top_bar.setContentsMargins(10, 5, 10, 5)

        self.info_label = QLabel('X: 0.000  Y: 0.000  Z: 0.000')
        self.info_label.setStyleSheet('color: #4fc3f7; font-family: Consolas, monospace; font-size: 12px;')
        top_bar.addWidget(self.info_label)

        top_bar.addStretch()

        self.view_combo = QComboBox()
        self.view_combo.addItems(['Isometric', 'Top', 'Front', 'Side', 'X-Y', 'X-Z', 'Y-Z'])
        self.view_combo.currentIndexChanged.connect(self._on_view_changed)
        top_bar.addWidget(self.view_combo)

        layout.addLayout(top_bar)

        self._canvas = _ViewCanvas(self)
        layout.addWidget(self._canvas, 1)

    def _on_view_changed(self, index):
        views = {
            0: (35, -45),
            1: (90, 0),
            2: (0, 0),
            3: (0, 90),
            4: (90, 0),
            5: (0, 90),
            6: (0, 0),
        }
        if index in views:
            rx, ry = views[index]
            self._rotation_x = rx
            self._rotation_y = ry
            self._canvas.update()

    def set_grid_visible(self, visible: bool):
        self._grid_visible = visible
        self._canvas.update()

    def set_axes_visible(self, visible: bool):
        self._axes_visible = visible
        self._canvas.update()

    def set_path_visible(self, visible: bool):
        self._path_visible = visible
        self._canvas.update()

    def update_position(self, position: Dict[str, float]):
        self._current_position = position
        x = position.get('X', 0)
        y = position.get('Y', 0)
        z = position.get('Z', 0)
        self.info_label.setText(f'X: {x:.3f}  Y: {y:.3f}  Z: {z:.3f}')
        self._canvas.update()

    def refresh(self):
        self._path_points = self.service.get_tool_path_points()
        self._canvas.update()

    def resizeEvent(self, event):
        self._canvas.update()
        super().resizeEvent(event)


class _ViewCanvas(QWidget):
    def __init__(self, parent: View3D):
        super().__init__(parent)
        self._parent_view = parent
        self.setAutoFillBackground(True)
        palette = self.palette()
        palette.setColor(self.backgroundRole(), QColor(30, 30, 30))
        self.setPalette(palette)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, True)

        w = self.width()
        h = self.height()

        painter.fillRect(0, 0, w, h, QColor(30, 30, 30))

        center_x = w / 2 + self._parent_view._pan_x
        center_y = h / 2 + self._parent_view._pan_y

        painter.save()
        painter.translate(center_x, center_y)
        painter.scale(self._parent_view._zoom, self._parent_view._zoom)

        painter.rotate(self._parent_view._rotation_y)
        painter.rotate(0, 0)

        self._draw_axes(painter)
        self._draw_grid(painter)
        self._draw_machine(painter)
        self._draw_tool_path(painter)
        self._draw_current_position(painter)

        painter.restore()

    def _project_3d_to_2d(self, x, y, z):
        rx = math.radians(self._parent_view._rotation_x)
        ry = math.radians(self._parent_view._rotation_y)

        cos_x, sin_x = math.cos(rx), math.sin(rx)
        cos_y, sin_y = math.cos(ry), math.sin(ry)

        px = x * cos_y - z * sin_y
        py = -(y * cos_x - (x * sin_y + z * cos_y) * sin_x)

        return px, py

    def _draw_axes(self, painter: QPainter):
        if not self._parent_view._axes_visible:
            return

        axis_length = 200
        line_width = max(1, int(2 / self._parent_view._zoom))

        for axis, color, label in [
            ('X', QColor(239, 83, 80), 'X'),
            ('Y', QColor(129, 199, 132), 'Y'),
            ('Z', QColor(79, 195, 247), 'Z'),
        ]:
            pen = QPen(color, line_width)
            painter.setPen(pen)

            if axis == 'X':
                p0 = self._project_3d_to_2d(0, 0, 0)
                p1 = self._project_3d_to_2d(axis_length, 0, 0)
            elif axis == 'Y':
                p0 = self._project_3d_to_2d(0, 0, 0)
                p1 = self._project_3d_to_2d(0, axis_length, 0)
            else:
                p0 = self._project_3d_to_2d(0, 0, 0)
                p1 = self._project_3d_to_2d(0, 0, axis_length)

            painter.drawLine(
                QPointF(p0[0], p0[1]),
                QPointF(p1[0], p1[1])
            )

            font_size = max(8, int(12 / self._parent_view._zoom))
            painter.setFont(QFont('Arial', font_size))
            painter.drawText(QPointF(p1[0] + 5, p1[1]), label)

    def _draw_grid(self, painter: QPainter):
        if not self._parent_view._grid_visible:
            return

        grid_size = 50
        grid_count = 10
        line_width = max(1, int(0.5 / self._parent_view._zoom))

        pen = QPen(QColor(80, 80, 80), line_width, Qt.DashLine)
        painter.setPen(pen)

        half_range = grid_size * grid_count

        for i in range(-grid_count, grid_count + 1):
            pos = i * grid_size

            p_start = self._project_3d_to_2d(pos, -half_range, 0)
            p_end = self._project_3d_to_2d(pos, half_range, 0)
            painter.drawLine(QPointF(p_start[0], p_start[1]), QPointF(p_end[0], p_end[1]))

            p_start = self._project_3d_to_2d(-half_range, pos, 0)
            p_end = self._project_3d_to_2d(half_range, pos, 0)
            painter.drawLine(QPointF(p_start[0], p_start[1]), QPointF(p_end[0], p_end[1]))

        pen_axis = QPen(QColor(100, 100, 100), line_width * 2)
        painter.setPen(pen_axis)
        p0 = self._project_3d_to_2d(0, 0, 0)
        p1 = self._project_3d_to_2d(half_range, 0, 0)
        painter.drawLine(QPointF(p0[0], p0[1]), QPointF(p1[0], p1[1]))
        p1 = self._project_3d_to_2d(0, half_range, 0)
        painter.drawLine(QPointF(p0[0], p0[1]), QPointF(p1[0], p1[1]))

    def _draw_machine(self, painter: QPainter):
        machine = self._parent_view.service.machine_model
        if not machine:
            return

        line_width = max(1, int(1.5 / self._parent_view._zoom))

        pen = QPen(QColor(150, 150, 150), line_width)
        painter.setPen(pen)

        tx, ty, tz = machine.table_position
        tw, th, td = machine.table_size

        corners = [
            (tx, ty, tz),
            (tx + tw, ty, tz),
            (tx + tw, ty + th, tz),
            (tx, ty + th, tz),
            (tx, ty, tz + td),
            (tx + tw, ty, tz + td),
            (tx + tw, ty + th, tz + td),
            (tx, ty + th, tz + td),
        ]

        projected = [self._project_3d_to_2d(*c) for c in corners]

        edges = [
            (0, 1), (1, 2), (2, 3), (3, 0),
            (4, 5), (5, 6), (6, 7), (7, 4),
            (0, 4), (1, 5), (2, 6), (3, 7),
        ]

        for i, j in edges:
            painter.drawLine(
                QPointF(projected[i][0], projected[i][1]),
                QPointF(projected[j][0], projected[j][1])
            )

        pos = self._parent_view._current_position
        x, y, z = pos.get('X', 0), pos.get('Y', 0), pos.get('Z', 0)

        spindle_len = machine.spindle_length
        spindle_r = machine.spindle_radius

        top_center = self._project_3d_to_2d(x, y, z + spindle_len)
        bottom_center = self._project_3d_to_2d(x, y, z)

        spindle_pen = QPen(QColor(255, 152, 0), line_width * 1.5)
        painter.setPen(spindle_pen)
        painter.drawLine(
            QPointF(top_center[0], top_center[1]),
            QPointF(bottom_center[0], bottom_center[1])
        )

        tool_len = machine.tool_length
        tool_top = self._project_3d_to_2d(x, y, z)
        tool_bottom = self._project_3d_to_2d(x, y, z - tool_len)

        tool_pen = QPen(QColor(239, 83, 80), line_width * 2)
        painter.setPen(tool_pen)
        painter.drawLine(
            QPointF(tool_top[0], tool_top[1]),
            QPointF(tool_bottom[0], tool_bottom[1])
        )

    def _draw_tool_path(self, painter: QPainter):
        if not self._parent_view._path_visible:
            return

        points = self._parent_view.service.get_tool_path_points()
        if len(points) < 2:
            return

        line_width = max(1, int(1 / self._parent_view._zoom))
        pen = QPen(QColor(79, 195, 247), line_width)
        painter.setPen(pen)

        for i in range(len(points) - 1):
            p1 = self._project_3d_to_2d(
                points[i].get('X', 0),
                points[i].get('Y', 0),
                points[i].get('Z', 0)
            )
            p2 = self._project_3d_to_2d(
                points[i + 1].get('X', 0),
                points[i + 1].get('Y', 0),
                points[i + 1].get('Z', 0)
            )
            painter.drawLine(
                QPointF(p1[0], p1[1]),
                QPointF(p2[0], p2[1])
            )

    def _draw_current_position(self, painter: QPainter):
        pos = self._parent_view._current_position
        x, y, z = pos.get('X', 0), pos.get('Y', 0), pos.get('Z', 0)

        p = self._project_3d_to_2d(x, y, z)
        radius = max(3, int(6 / self._parent_view._zoom))

        painter.setPen(QPen(QColor(239, 83, 80), 2))
        painter.setBrush(QColor(239, 83, 80, 100))

        painter.drawEllipse(QPointF(p[0], p[1]), radius, radius)

    def mousePressEvent(self, event):
        self._parent_view._last_pos = event.pos()

    def mouseMoveEvent(self, event):
        if self._parent_view._last_pos is not None:
            dx = event.x() - self._parent_view._last_pos.x()
            dy = event.y() - self._parent_view._last_pos.y()

            if event.buttons() & Qt.LeftButton:
                self._parent_view._rotation_y += dx * 0.5
                self._parent_view._rotation_x = max(
                    -90, min(90, self._parent_view._rotation_x + dy * 0.5)
                )
            elif event.buttons() & Qt.RightButton:
                self._parent_view._pan_x += dx
                self._parent_view._pan_y += dy

            self._parent_view._last_pos = event.pos()
            self.update()

    def mouseReleaseEvent(self, event):
        self._parent_view._last_pos = None

    def wheelEvent(self, event):
        angle = event.angleDelta().y()
        if angle > 0:
            self._parent_view._zoom = min(3.0, self._parent_view._zoom * 1.1)
        else:
            self._parent_view._zoom = max(0.2, self._parent_view._zoom / 1.1)
        self.update()
