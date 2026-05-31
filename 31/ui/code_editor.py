from PyQt5.QtCore import Qt, QRegularExpression
from PyQt5.QtGui import (
    QColor, QTextCharFormat, QFont, QSyntaxHighlighter,
    QTextDocument, QTextCursor, QPainter
)
from PyQt5.QtWidgets import QPlainTextEdit, QTextEdit, QWidget


class GCodeHighlighter(QSyntaxHighlighter):
    def __init__(self, document: QTextDocument):
        super().__init__(document)
        self._formats = {}
        self._init_formats()

    def _init_formats(self):
        g_code_fmt = QTextCharFormat()
        g_code_fmt.setForeground(QColor(129, 199, 132))
        g_code_fmt.setFontWeight(QFont.Bold)
        self._formats['G_code'] = g_code_fmt

        m_code_fmt = QTextCharFormat()
        m_code_fmt.setForeground(QColor(255, 152, 0))
        m_code_fmt.setFontWeight(QFont.Bold)
        self._formats['M_code'] = m_code_fmt

        coord_fmt = QTextCharFormat()
        coord_fmt.setForeground(QColor(79, 195, 247))
        self._formats['coordinate'] = coord_fmt

        feed_fmt = QTextCharFormat()
        feed_fmt.setForeground(QColor(239, 83, 80))
        self._formats['feed'] = feed_fmt

        spindle_fmt = QTextCharFormat()
        spindle_fmt.setForeground(QColor(179, 136, 255))
        self._formats['spindle'] = spindle_fmt

        comment_fmt = QTextCharFormat()
        comment_fmt.setForeground(QColor(120, 120, 120))
        comment_fmt.setFontItalic(True)
        self._formats['comment'] = comment_fmt

        line_num_fmt = QTextCharFormat()
        line_num_fmt.setForeground(QColor(100, 100, 100))
        self._formats['line_number'] = line_num_fmt

    def highlightBlock(self, text: str):
        import re

        comment_pattern = r'\([^)]*\)|;[^\n]*'
        for match in re.finditer(comment_pattern, text):
            self.setFormat(match.start(), len(match.group()), self._formats['comment'])

        comment_free = re.sub(comment_pattern, ' ' * len(text), text)

        line_num_pattern = r'N\d+'
        for match in re.finditer(line_num_pattern, comment_free):
            self.setFormat(match.start(), len(match.group()), self._formats['line_number'])

        g_pattern = r'G\d{1,3}(\.\d+)?'
        for match in re.finditer(g_pattern, comment_free):
            self.setFormat(match.start(), len(match.group()), self._formats['G_code'])

        m_pattern = r'M\d{1,3}'
        for match in re.finditer(m_pattern, comment_free):
            self.setFormat(match.start(), len(match.group()), self._formats['M_code'])

        coord_pattern = r'[XYZABC]\s*-?\d+\.?\d*'
        for match in re.finditer(coord_pattern, comment_free):
            self.setFormat(match.start(), len(match.group()), self._formats['coordinate'])

        feed_pattern = r'[F]\s*-?\d+\.?\d*'
        for match in re.finditer(feed_pattern, comment_free):
            self.setFormat(match.start(), len(match.group()), self._formats['feed'])

        spindle_pattern = r'[S]\s*-?\d+\.?\d*'
        for match in re.finditer(spindle_pattern, comment_free):
            self.setFormat(match.start(), len(match.group()), self._formats['spindle'])


class LineNumberArea(QWidget):
    def __init__(self, editor):
        super().__init__(editor)
        self.editor = editor

    def sizeHint(self):
        from PyQt5.QtCore import QSize
        return QSize(self.editor.line_number_area_width(), 0)

    def paintEvent(self, event):
        self.editor.line_number_area_paint_event(event)


class GCodeEditor(QPlainTextEdit):
    def __init__(self, parent=None):
        super().__init__(parent)
        self._editable = True

        self._highlighter = GCodeHighlighter(self.document())

        self._line_number_area = LineNumberArea(self)

        self.blockCountChanged.connect(self._update_line_number_area_width)
        self.updateRequest.connect(self._update_line_number_area)
        self.cursorPositionChanged.connect(self._highlight_current_line)

        self._update_line_number_area_width(0)
        self._highlight_current_line()

        self.setFont(QFont('Consolas', 10))
        self.setStyleSheet("""
            QPlainTextEdit {
                background-color: #252526;
                color: #e0e0e0;
                border: none;
                selection-background-color: #264f78;
            }
            QPlainTextEdit:focus {
                border: none;
            }
        """)

        self.setPlaceholderText('Load a G-code file or enter code here...')
        self.setLineWrapMode(QPlainTextEdit.NoWrap)
        self.setTabStopDistance(40)

    def line_number_area_width(self) -> int:
        digits = 1
        max_block = max(1, self.blockCount())
        while max_block >= 10:
            max_block /= 10
            digits += 1
        space = 3 + self.fontMetrics().horizontalAdvance('9') * digits
        return space

    def _update_line_number_area_width(self, _):
        self.setViewportMargins(self.line_number_area_width(), 0, 0, 0)

    def _update_line_number_area(self, rect, dy):
        if dy:
            self._line_number_area.scroll(0, dy)
        else:
            self._line_number_area.update(0, rect.y(), self._line_number_area.width(), rect.height())

        if rect.contains(self.viewport().rect()):
            self._update_line_number_area_width(0)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        cr = self.contentsRect()
        self._line_number_area.setGeometry(
            cr.left(), cr.top(), self.line_number_area_width(), cr.height()
        )

    def line_number_area_paint_event(self, event):
        painter = QPainter(self._line_number_area)
        painter.fillRect(event.rect(), QColor(30, 30, 30))

        painter.setPen(QColor(80, 80, 80))
        font = self.font()
        font.setPointSize(8)
        painter.setFont(font)

        block = self.firstVisibleBlock()
        block_number = block.blockNumber()
        top = self.blockBoundingGeometry(block).translated(self.contentOffset()).top()
        bottom = top + self.blockBoundingRect(block).height()

        while block.isValid() and top <= event.rect().bottom():
            if block.isVisible() and bottom >= event.rect().top():
                number = str(block_number + 1)
                painter.drawText(
                    0, int(top), self._line_number_area.width() - 3,
                    self.fontMetrics().height(), Qt.AlignRight, number
                )

            block = block.next()
            top = bottom
            bottom = top + self.blockBoundingRect(block).height()
            block_number += 1

    def _highlight_current_line(self):
        extra_selections = []

        if not self.isReadOnly():
            selection = QTextEdit.ExtraSelection()
            line_color = QColor(45, 45, 45, 80)
            selection.format.setBackground(line_color)
            selection.format.setProperty(QTextCharFormat.FullWidthSelection, True)
            selection.cursor = self.textCursor()
            selection.cursor.clearSelection()
            extra_selections.append(selection)

        self.setExtraSelections(extra_selections)

    def get_text(self) -> str:
        return self.toPlainText()

    def set_text(self, text: str):
        self.setPlainText(text)
        self._highlighter = GCodeHighlighter(self.document())

    def set_editable(self, editable: bool):
        self._editable = editable
        self.setReadOnly(not editable)

    def highlight_line(self, line_number: int):
        if line_number <= 0 or line_number > self.blockCount():
            return

        cursor = QTextCursor(self.document().findBlockByNumber(line_number - 1))
        self.setTextCursor(cursor)
