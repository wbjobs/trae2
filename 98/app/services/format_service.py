import re
from typing import Optional


class FormatService:
    def standardize_format(self, content: str, file_type: Optional[str] = None) -> str:
        if not content:
            return content

        result = content

        result = self._normalize_line_breaks(result)
        result = self._standardize_punctuation(result)
        result = self._standardize_whitespace(result)
        result = self._standardize_numbering(result)
        result = self._standardize_quotes(result)

        return result.strip()

    def _normalize_line_breaks(self, content: str) -> str:
        content = re.sub(r"\r\n", "\n", content)
        content = re.sub(r"\r", "\n", content)
        content = re.sub(r"\n{3,}", "\n\n", content)
        return content

    def _standardize_punctuation(self, content: str) -> str:
        content = re.sub(r"([，。！？；：）])\1+", r"\1", content)
        content = re.sub(r"\s+([，。！？；：）])", r"\1", content)
        content = re.sub(r"([（])\s+", r"\1", content)
        return content

    def _standardize_whitespace(self, content: str) -> str:
        lines = content.split("\n")
        result_lines = []
        for line in lines:
            stripped = line.strip()
            if stripped:
                result_lines.append("    " + stripped)
            else:
                result_lines.append("")
        return "\n".join(result_lines)

    def _standardize_numbering(self, content: str) -> str:
        lines = content.split("\n")
        result_lines = []
        counter = {"一": 1, "1": 1, "（1）": 1}

        for line in lines:
            stripped = line.strip()

            match = re.match(r"^[一二三四五六七八九十]+、", stripped)
            if match:
                num = counter["一"]
                cn_num = self._number_to_chinese(num)
                new_line = re.sub(r"^[一二三四五六七八九十]+、", f"{cn_num}、", line)
                result_lines.append(new_line)
                counter["一"] += 1
                counter["1"] = 1
                continue

            match = re.match(r"^\d+[.、]", stripped)
            if match:
                new_line = re.sub(r"^\d+([.、])", lambda m: f"{counter['1']}{m.group(1)}", line)
                result_lines.append(new_line)
                counter["1"] += 1
                continue

            match = re.match(r"^[（(]\d+[）)]", stripped)
            if match:
                new_line = re.sub(r"^[（(]\d+[）)]", f"（{counter['1']}）", line)
                result_lines.append(new_line)
                counter["1"] += 1
                continue

            result_lines.append(line)

        return "\n".join(result_lines)

    def _number_to_chinese(self, num: int) -> str:
        digits = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"]
        tens = ["", "十", "二十", "三十", "四十", "五十", "六十", "七十", "八十", "九十"]

        if num == 0:
            return "零"
        if num < 10:
            return digits[num]
        if num < 20:
            return "十" + digits[num % 10]
        if num < 100:
            return tens[num // 10] + digits[num % 10]
        return str(num)

    def _standardize_quotes(self, content: str) -> str:
        content = re.sub(r'"', "“", content, count=1)
        content = re.sub(r'"', "”", content)
        content = re.sub(r"'", "‘", content, count=1)
        content = re.sub(r"'", "’", content)
        return content

    def format_title(self, title: str) -> str:
        title = title.strip()
        title = re.sub(r"\s+", " ", title)
        return title

    def format_date(self, date_str: str) -> str:
        date_str = re.sub(r"[年/\-]", "年", date_str, count=1)
        date_str = re.sub(r"[月/\-]", "月", date_str, count=1)
        if not date_str.endswith("日"):
            date_str = re.sub(r"\d+$", lambda m: m.group() + "日", date_str)
        return date_str

    def extract_headings(self, content: str) -> list:
        headings = []
        lines = content.split("\n")

        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if not stripped:
                continue

            if re.match(r"^[一二三四五六七八九十]+、", stripped) and len(stripped) < 50:
                headings.append({
                    "level": 1,
                    "text": stripped,
                    "line": i,
                })
            elif re.match(r"^\d+[.、]", stripped) and len(stripped) < 60:
                headings.append({
                    "level": 2,
                    "text": stripped,
                    "line": i,
                })
            elif re.match(r"^[（(]\d+[）)]", stripped) and len(stripped) < 70:
                headings.append({
                    "level": 3,
                    "text": stripped,
                    "line": i,
                })

        return headings


format_service = FormatService()
