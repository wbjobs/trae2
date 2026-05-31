import re
from typing import List, Tuple
from .models import GCodeToken


class GCodeLexer:
    TOKEN_PATTERNS = [
        ('COMMENT_PAREN', r'\([^)]*\)'),
        ('COMMENT_SEMICOLON', r';[^\n]*'),
        ('G_CODE', r'G\d{1,3}\.\d+'),
        ('G_CODE_INT', r'G\d{1,3}'),
        ('M_CODE', r'M\d{1,3}'),
        ('N_NUMBER', r'N\d+'),
        ('WORD', r'[A-Za-z]\s*[+-]?(\d+\.?\d*|\.\d+)'),
        ('NUMBER', r'[+-]?(\d+\.?\d*|\.\d+)'),
        ('NEWLINE', r'\n'),
        ('WHITESPACE', r'[ \t]+'),
        ('UNKNOWN', r'.'),
    ]

    def __init__(self):
        self._token_regex = re.compile(
            '|'.join(f'(?P<{name}>{pattern})' for name, pattern in self.TOKEN_PATTERNS),
            re.IGNORECASE
        )

    def tokenize(self, text: str) -> List[GCodeToken]:
        tokens = []
        line_number = 0
        position = 0

        for match in self._token_regex.finditer(text):
            token_type = match.lastgroup
            value = match.group()
            line_number = text.count('\n', 0, match.start()) + 1
            position = match.start()

            if token_type == 'NEWLINE':
                tokens.append(GCodeToken('NEWLINE', '', line_number, position))
            elif token_type == 'WHITESPACE':
                continue
            elif token_type == 'UNKNOWN':
                tokens.append(GCodeToken('UNKNOWN', value, line_number, position))
            else:
                tokens.append(GCodeToken(token_type, value.strip(), line_number, position))

        return tokens

    def tokenize_line(self, line: str, line_number: int = 0) -> List[GCodeToken]:
        tokens = []
        position = 0

        for match in self._token_regex.finditer(line):
            token_type = match.lastgroup
            value = match.group()
            position = match.start()

            if token_type in ('NEWLINE', 'WHITESPACE'):
                continue
            tokens.append(GCodeToken(token_type, value.strip(), line_number, position))

        return tokens
