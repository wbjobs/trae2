import re
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from app.core import log


class LawExtractor:
    LAW_TYPE_PATTERNS = [
        (r"中华人民共和国.*法", "法律"),
        (r"中华人民共和国.*条例", "行政法规"),
        (r".*条例", "地方性法规"),
        (r".*规定", "规章"),
        (r".*办法", "规章"),
        (r".*细则", "规章"),
        (r".*司法解释", "司法解释"),
    ]

    ARTICLE_PATTERNS = [
        r"第[一二三四五六七八九十百千万零〇\d]+条",
        r"第\s*[一二三四五六七八九十百千万零〇\d]+\s*条",
        r"^\s*\d+\s*[.、\s]",
    ]

    CHAPTER_PATTERNS = [
        r"第[一二三四五六七八九十百千万零〇]+章",
        r"第\s*[一二三四五六七八九十百千万零〇]+\s*章",
    ]

    SECTION_PATTERNS = [
        r"第[一二三四五六七八九十百千万零〇]+节",
        r"第\s*[一二三四五六七八九十百千万零〇]+\s*节",
    ]

    def __init__(self):
        self.article_regex = re.compile("|".join(self.ARTICLE_PATTERNS), re.MULTILINE)
        self.chapter_regex = re.compile("|".join(self.CHAPTER_PATTERNS))
        self.section_regex = re.compile("|".join(self.SECTION_PATTERNS))

    def extract_laws(self, content: str, source: Optional[str] = None) -> List[Dict[str, Any]]:
        log.info("开始提取法律条文...")
        laws = []

        title = self._extract_title(content)
        law_type = self._detect_law_type(title or content)
        effective_date = self._extract_date(content)

        articles = self._split_articles(content)
        log.info(f"提取到 {len(articles)} 个法条")

        current_chapter = None
        current_section = None

        for i, article in enumerate(articles):
            article_no, article_title, article_content = self._parse_article(article)

            chapter_match = self.chapter_regex.search(article)
            if chapter_match:
                current_chapter = chapter_match.group().strip()

            section_match = self.section_regex.search(article)
            if section_match:
                current_section = section_match.group().strip()

            if article_no or len(article.strip()) > 50:
                law_data = {
                    "title": article_title or f"{title} 第{len(laws) + 1}条",
                    "article_no": article_no,
                    "law_type": law_type,
                    "category": self._detect_category(content),
                    "chapter": current_chapter,
                    "section": current_section,
                    "content": article_content or article,
                    "source": source,
                    "effective_date": effective_date.isoformat() if effective_date else None,
                    "status": "active",
                    "tags": self._extract_tags(article_content or article)
                }
                laws.append(law_data)

        return laws

    def extract_cases(self, content: str, source: Optional[str] = None) -> List[Dict[str, Any]]:
        log.info("开始提取案例信息...")
        cases = []

        title = self._extract_case_title(content)
        case_no = self._extract_case_no(content)
        court = self._extract_court(content)
        case_type = self._detect_case_type(content)
        judgment_date = self._extract_date(content)
        parties = self._extract_parties(content)
        summary, legal_basis, judgment_result = self._split_case_content(content)

        case_data = {
            "title": title or "未命名案例",
            "case_no": case_no,
            "court": court,
            "case_type": case_type,
            "judgment_date": judgment_date.isoformat() if judgment_date else None,
            "parties": parties,
            "summary": summary,
            "content": content,
            "legal_basis": legal_basis,
            "judgment_result": judgment_result,
            "tags": self._extract_tags(content)
        }
        cases.append(case_data)
        log.info(f"提取到 {len(cases)} 个案例")
        return cases

    def _extract_title(self, content: str) -> Optional[str]:
        lines = content.split("\n")
        for line in lines[:20]:
            line = line.strip()
            if line and len(line) < 200:
                if any(keyword in line for keyword in ["法", "条例", "规定", "办法", "细则"]):
                    return line
        return None

    def _extract_case_title(self, content: str) -> Optional[str]:
        lines = content.split("\n")
        for line in lines[:10]:
            line = line.strip()
            if line and ("判决书" in line or "裁定书" in line or "调解书" in line or "决定书" in line):
                return line
            if line and len(line) < 100 and ("诉" in line or "纠纷" in line):
                return line
        return None

    def _detect_law_type(self, content: str) -> Optional[str]:
        for pattern, law_type in self.LAW_TYPE_PATTERNS:
            if re.search(pattern, content):
                return law_type
        return None

    def _detect_category(self, content: str) -> Optional[str]:
        categories = {
            "民事": ["民事", "合同", "侵权", "婚姻", "继承", "物权", "债权"],
            "刑事": ["刑事", "犯罪", "刑罚", "公诉", "自诉"],
            "行政": ["行政", "行政复议", "行政诉讼", "行政处罚"],
            "商事": ["公司", "企业", "破产", "票据", "保险", "海商"],
            "经济": ["反垄断", "反不正当竞争", "消费者", "产品质量"],
            "劳动": ["劳动", "劳动合同", "社会保险", "工伤"],
            "知识产权": ["专利", "商标", "著作权", "知识产权"],
            "诉讼": ["诉讼", "管辖", "证据", "执行"],
        }

        content_lower = content[:1000]
        max_count = 0
        detected = None

        for category, keywords in categories.items():
            count = sum(1 for kw in keywords if kw in content_lower)
            if count > max_count:
                max_count = count
                detected = category

        return detected

    def _detect_case_type(self, content: str) -> Optional[str]:
        case_types = {
            "民事": ["民事", "合同纠纷", "侵权责任", "婚姻家庭", "继承"],
            "刑事": ["刑事", "被告人", "公诉机关", "犯罪"],
            "行政": ["行政", "行政机关", "行政处罚", "行政复议"],
            "商事": ["公司", "股东", "破产", "合同"],
        }

        content_lower = content[:1000]
        max_count = 0
        detected = None

        for case_type, keywords in case_types.items():
            count = sum(1 for kw in keywords if kw in content_lower)
            if count > max_count:
                max_count = count
                detected = case_type

        return detected

    def _extract_date(self, content: str) -> Optional[datetime]:
        date_patterns = [
            r"(\d{4})年(\d{1,2})月(\d{1,2})日",
            r"(\d{4})-(\d{1,2})-(\d{1,2})",
            r"(\d{4})/(\d{1,2})/(\d{1,2})",
        ]

        for pattern in date_patterns:
            match = re.search(pattern, content)
            if match:
                try:
                    year, month, day = map(int, match.groups())
                    return datetime(year, month, day)
                except ValueError:
                    continue
        return None

    def _extract_case_no(self, content: str) -> Optional[str]:
        patterns = [
            r"[(（](\d{4})[)）].{0,10}(\d+)\s*号",
            r"(\d{4})\s*[\u4e00-\u9fff]{0,5}\s*字\s*第\s*(\d+)\s*号",
        ]

        for pattern in patterns:
            match = re.search(pattern, content)
            if match:
                return match.group()
        return None

    def _extract_court(self, content: str) -> Optional[str]:
        court_pattern = r"([\u4e00-\u9fff]{2,20}人民法院)"
        match = re.search(court_pattern, content)
        if match:
            return match.group(1)
        return None

    def _extract_parties(self, content: str) -> List[str]:
        parties = []

        plaintiff_pattern = r"原告[：:]\s*([^\n,，；;]+)"
        defendant_pattern = r"被告[：:]\s*([^\n,，；;]+)"
        appellant_pattern = r"上诉人[：:]\s*([^\n,，；;]+)"
        appellee_pattern = r"被上诉人[：:]\s*([^\n,，；;]+)"

        for pattern in [plaintiff_pattern, defendant_pattern, appellant_pattern, appellee_pattern]:
            matches = re.findall(pattern, content)
            parties.extend([m.strip() for m in matches if m.strip()])

        return list(set(parties))

    def _split_articles(self, content: str) -> List[str]:
        matches = list(self.article_regex.finditer(content))
        if not matches:
            return [content]

        articles = []
        for i, match in enumerate(matches):
            start = match.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
            article_text = content[start:end].strip()
            if article_text:
                articles.append(article_text)

        return articles

    def _parse_article(self, article: str) -> Tuple[Optional[str], Optional[str], str]:
        first_line_end = article.find("\n")
        if first_line_end == -1:
            first_line_end = len(article)
        first_line = article[:first_line_end].strip()

        article_no_match = self.article_regex.match(first_line)
        article_no = None
        article_title = None

        if article_no_match:
            article_no = article_no_match.group().strip()
            remaining = first_line[article_no_match.end():].strip()
            if remaining and len(remaining) < 100:
                article_title = remaining
            content = article[first_line_end:].strip() if first_line_end < len(article) else remaining
        else:
            content = article

        return article_no, article_title, content

    def _split_case_content(self, content: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        summary = None
        legal_basis = None
        judgment_result = None

        basic_facts_pattern = r"(本院查明|经审理查明|基本案情)[：:](.*?)(?=本院认为|本院认定|依照|依据)"
        match = re.search(basic_facts_pattern, content, re.DOTALL)
        if match:
            summary = match.group(2).strip()

        legal_basis_pattern = r"(依照|依据)(.*?)(?=判决如下|裁定如下|决定如下)"
        match = re.search(legal_basis_pattern, content, re.DOTALL)
        if match:
            legal_basis = match.group(2).strip()

        judgment_pattern = r"(判决如下|裁定如下|决定如下)[：:](.*?)$"
        match = re.search(judgment_pattern, content, re.DOTALL)
        if match:
            judgment_result = match.group(2).strip()

        return summary, legal_basis, judgment_result

    def _extract_tags(self, content: str) -> List[str]:
        tags = []
        common_tags = [
            "合同", "侵权", "婚姻", "继承", "物权", "债权", "知识产权",
            "劳动", "工伤", "交通事故", "医疗纠纷", "消费者权益",
            "房产", "土地", "建设工程", "金融", "票据", "保险",
            "公司", "股东", "破产", "清算", "合伙",
            "刑事", "盗窃", "诈骗", "故意伤害", "贪污", "受贿",
            "行政复议", "行政诉讼", "行政处罚", "国家赔偿"
        ]

        for tag in common_tags:
            if tag in content:
                tags.append(tag)

        return list(set(tags))[:10]


law_extractor = LawExtractor()
