import math
from typing import List, Optional, Tuple, Dict
from .models import (
    GCodeCommand, GCodeToken, MotionType, CoordinateSystem, Plane
)
from .lexer import GCodeLexer


class GCodeParser:
    def __init__(self):
        self.lexer = GCodeLexer()
        self._reset_state()

    def _reset_state(self):
        self.current_motion_type = MotionType.RAPID
        self.current_coordinate_system = CoordinateSystem.ABSOLUTE
        self.current_plane = Plane.XY
        self.current_feed_rate = None
        self.current_spindle_speed = None
        self.last_coordinates = {'X': 0.0, 'Y': 0.0, 'Z': 0.0}
        self.last_center_offsets = {'I': 0.0, 'J': 0.0, 'K': 0.0}

    def parse_file(self, filepath: str) -> List[GCodeCommand]:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        return self.parse(content)

    def parse(self, text: str) -> List[GCodeCommand]:
        self._reset_state()
        lines = text.split('\n')
        commands = []

        for line_number, line_text in enumerate(lines, 1):
            line_text = line_text.strip()
            if not line_text:
                continue

            tokens = self.lexer.tokenize_line(line_text, line_number)
            command = self._parse_line_tokens(line_text, line_number, tokens)
            if command:
                commands.append(command)

        return commands

    def _parse_line_tokens(
        self,
        line_text: str,
        line_number: int,
        tokens: List[GCodeToken]
    ) -> Optional[GCodeCommand]:
        try:
            command = GCodeCommand(
                line_number=line_number,
                original_text=line_text,
                motion_type=self.current_motion_type,
                coordinate_system=self.current_coordinate_system,
                plane=self.current_plane
            )

            if self.current_feed_rate is not None:
                command.feed_rate = self.current_feed_rate
            if self.current_spindle_speed is not None:
                command.spindle_speed = self.current_spindle_speed

            command.coordinates = dict(self.last_coordinates)
            command.center_offsets = dict(self.last_center_offsets)

            explicit_axes: set = set()
            has_motion = False
            for token in tokens:
                ttype = token.type
                value = token.value

                if ttype in ('COMMENT_PAREN', 'COMMENT_SEMICOLON'):
                    command.is_comment = True
                    if ttype == 'COMMENT_PAREN':
                        command.comment_text = value[1:-1]
                    else:
                        command.comment_text = value[1:]
                    continue

                if ttype == 'G_CODE' or ttype == 'G_CODE_INT':
                    g_code = value.upper()
                    code_num = g_code[1:]
                    try:
                        code_val = float(code_num)
                    except ValueError:
                        command.errors.append(f'Invalid G-code: {g_code}')
                        continue

                    self._handle_g_code(code_val, command)

                elif ttype == 'M_CODE':
                    m_code = value.upper()
                    try:
                        m_val = int(m_code[1:])
                    except ValueError:
                        command.errors.append(f'Invalid M-code: {m_code}')
                        continue
                    self._handle_m_code(m_val, command)

                elif ttype == 'WORD':
                    letter = value[0].upper()
                    try:
                        number = float(value[1:])
                    except ValueError:
                        command.errors.append(f'Invalid word format: {value}')
                        continue

                    self._handle_word(letter, number, command)
                    if letter in ('X', 'Y', 'Z', 'A', 'B', 'C'):
                        explicit_axes.add(letter)
                        command.explicit_axes.add(letter)
                        has_motion = True

            if command.motion_type in (MotionType.RAPID, MotionType.LINEAR) and has_motion:
                pass
            elif command.motion_type in (MotionType.CIRCULAR_CW, MotionType.CIRCULAR_CCW):
                if not has_motion and not command.errors:
                    command.errors.append('Circular motion requires at least one axis')
            elif not has_motion:
                if command.is_comment:
                    return command
                if not command.errors and not command.warnings:
                    if command.motion_type != self.current_motion_type:
                        pass
                    else:
                        return None

            if has_motion:
                for axis in explicit_axes:
                    if axis in command.coordinates:
                        self.last_coordinates[axis] = command.coordinates[axis]

            return command
        except Exception as e:
            cmd = GCodeCommand(
                line_number=line_number,
                original_text=line_text,
                motion_type=MotionType.NONE,
                errors=[f'Parser exception: {str(e)}']
            )
            return cmd

    def _handle_g_code(self, code: float, command: GCodeCommand):
        code_int = int(code)

        if code == 0.0 or code_int == 0:
            command.motion_type = MotionType.RAPID
            self.current_motion_type = MotionType.RAPID
        elif code == 1.0 or code_int == 1:
            command.motion_type = MotionType.LINEAR
            self.current_motion_type = MotionType.LINEAR
        elif code == 2.0 or code_int == 2:
            command.motion_type = MotionType.CIRCULAR_CW
            self.current_motion_type = MotionType.CIRCULAR_CW
        elif code == 3.0 or code_int == 3:
            command.motion_type = MotionType.CIRCULAR_CCW
            self.current_motion_type = MotionType.CIRCULAR_CCW
        elif code == 4.0 or code_int == 4:
            command.motion_type = MotionType.DWELL
            self.current_motion_type = MotionType.DWELL
        elif code == 17.0 or code_int == 17:
            command.plane = Plane.XY
            self.current_plane = Plane.XY
        elif code == 18.0 or code_int == 18:
            command.plane = Plane.XZ
            self.current_plane = Plane.XZ
        elif code == 19.0 or code_int == 19:
            command.plane = Plane.YZ
            self.current_plane = Plane.YZ
        elif code == 20.0 or code_int == 20:
            command.warnings.append('Switching to inches (G20) - verify coordinates')
        elif code == 21.0 or code_int == 21:
            pass
        elif code == 90.0 or code_int == 90:
            command.coordinate_system = CoordinateSystem.ABSOLUTE
            self.current_coordinate_system = CoordinateSystem.ABSOLUTE
        elif code == 91.0 or code_int == 91:
            command.coordinate_system = CoordinateSystem.INCREMENTAL
            self.current_coordinate_system = CoordinateSystem.INCREMENTAL
        else:
            command.warnings.append(f'Unsupported G-code: G{code_int}')

    def _handle_m_code(self, code: int, command: GCodeCommand):
        supported_mcodes = {2, 3, 4, 5, 6, 7, 8, 9, 30}
        if code not in supported_mcodes:
            command.warnings.append(f'Unsupported M-code: M{code}')

    def _handle_word(self, letter: str, number: float, command: GCodeCommand):
        if letter in ('X', 'Y', 'Z', 'A', 'B', 'C'):
            if command.coordinate_system == CoordinateSystem.INCREMENTAL:
                current = command.coordinates.get(letter, 0.0)
                command.coordinates[letter] = current + number
            else:
                command.coordinates[letter] = number
        elif letter in ('I', 'J', 'K'):
            command.center_offsets[letter] = number
        elif letter == 'F':
            command.feed_rate = number
            self.current_feed_rate = number
        elif letter == 'S':
            command.spindle_speed = number
            self.current_spindle_speed = number
        elif letter == 'R':
            command.radius = number
        elif letter == 'T':
            command.warnings.append(f'Tool change T{int(number)} not fully supported')
        elif letter == 'H' or letter == 'D':
            pass
        elif letter == 'P':
            pass
        elif letter == 'L':
            pass
        else:
            command.warnings.append(f'Unknown word: {letter}')
