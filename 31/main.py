#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CNC Program Offline Simulation & Verification Desktop Client
Entry Point

Supports:
  - G-code CNC program import and parsing
  - Machine tool axis motion simulation
  - Hardware collision detection
  - Verification report generation
  - Cross-platform: Windows, Linux
"""

import sys
import os


def main():
    os.environ.setdefault('QT_AUTO_SCREEN_SCALE_FACTOR', '1')

    from PyQt5.QtWidgets import QApplication
    from PyQt5.QtCore import Qt
    from PyQt5.QtGui import QFont

    app = QApplication(sys.argv)
    app.setApplicationName('CNC Simulator')
    app.setOrganizationName('CNC Simulator Team')
    app.setStyle('Fusion')

    app.setStyleSheet("""
        QMainWindow, QWidget {
            background-color: #1e1e1e;
            color: #e0e0e0;
        }
        QMenuBar {
            background-color: #2d2d2d;
            color: #e0e0e0;
            border-bottom: 1px solid #444;
            padding: 2px;
        }
        QMenuBar::item {
            padding: 6px 12px;
            background: transparent;
        }
        QMenuBar::item:selected {
            background-color: #3d3d3d;
            border-radius: 4px;
        }
        QMenu {
            background-color: #2d2d2d;
            color: #e0e0e0;
            border: 1px solid #444;
            border-radius: 6px;
            padding: 4px;
        }
        QMenu::item {
            padding: 6px 24px;
            border-radius: 4px;
        }
        QMenu::item:selected {
            background-color: #094771;
        }
        QMenu::separator {
            height: 1px;
            background: #444;
            margin: 4px 8px;
        }
        QStatusBar {
            background-color: #2d2d2d;
            color: #aaa;
            border-top: 1px solid #444;
        }
        QToolBar {
            background-color: #2d2d2d;
            border: none;
            padding: 2px;
            spacing: 6px;
        }
        QDockWidget {
            titlebar-close-icon: none;
        }
        QDockWidget::title {
            background-color: #2d2d2d;
            padding: 6px;
            border-bottom: 1px solid #444;
        }
        QTabWidget::pane {
            border: 1px solid #444;
            border-radius: 4px;
            top: -1px;
        }
        QTabBar::tab {
            background-color: #2d2d2d;
            color: #aaa;
            padding: 6px 16px;
            border: 1px solid #444;
            border-bottom: none;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
            margin-right: 2px;
        }
        QTabBar::tab:selected {
            background-color: #3c3c3c;
            color: #4fc3f7;
            border-color: #4fc3f7;
        }
        QTabBar::tab:hover {
            color: #81d4fa;
        }
        QSlider::groove:horizontal {
            border: 1px solid #444;
            height: 4px;
            background: #3c3c3c;
            border-radius: 2px;
        }
        QSlider::handle:horizontal {
            background: #4fc3f7;
            border: none;
            width: 14px;
            margin: -6px 0;
            border-radius: 7px;
        }
        QSlider::sub-page:horizontal {
            background: #4fc3f7;
            border-radius: 2px;
        }
        QComboBox {
            background-color: #3c3c3c;
            color: #ddd;
            border: 1px solid #444;
            border-radius: 4px;
            padding: 4px 8px;
            min-width: 100px;
        }
        QComboBox:hover {
            border-color: #4fc3f7;
        }
        QComboBox QAbstractItemView {
            background-color: #2d2d2d;
            color: #ddd;
            border: 1px solid #444;
            selection-background-color: #094771;
        }
        QCheckBox {
            color: #ddd;
            spacing: 8px;
        }
        QCheckBox::indicator {
            width: 16px;
            height: 16px;
            border-radius: 3px;
            border: 2px solid #555;
            background: #2d2d2d;
        }
        QCheckBox::indicator:checked {
            background: #4fc3f7;
            border-color: #4fc3f7;
        }
        QSplitter::handle {
            background-color: #444;
        }
        QSplitter::handle:horizontal {
            width: 2px;
        }
        QScrollBar:vertical {
            background: #2d2d2d;
            width: 12px;
            border: none;
        }
        QScrollBar::handle:vertical {
            background: #555;
            border-radius: 6px;
            min-height: 30px;
        }
        QScrollBar::handle:vertical:hover {
            background: #666;
        }
        QScrollBar::add-line:vertical,
        QScrollBar::sub-line:vertical {
            height: 0;
        }
        QScrollBar:horizontal {
            background: #2d2d2d;
            height: 12px;
            border: none;
        }
        QScrollBar::handle:horizontal {
            background: #555;
            border-radius: 6px;
            min-width: 30px;
        }
        QScrollBar::handle:horizontal:hover {
            background: #666;
        }
    """)

    from ui.main_window import MainWindow

    window = MainWindow()
    window.show()

    sys.exit(app.exec_())


if __name__ == '__main__':
    main()
