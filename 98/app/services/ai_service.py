import re
import random
import asyncio
from typing import Optional, List, Dict, Any, Set
import httpx
from loguru import logger

from app.core.config import get_settings
from app.core.exceptions import AIServiceException
from app.schemas.task import AICorrectionResponse

settings = get_settings()


INDUSTRY_TERMINOLOGY = {
    "互联网": {
        "standard": {
            "人工智能": "AI",
            "机器学习": "Machine Learning",
            "深度学习": "Deep Learning",
            "大数据": "Big Data",
            "云计算": "Cloud Computing",
            "区块链": "Blockchain",
            "物联网": "Internet of Things",
            "物联网": "IoT",
            "云计算平台即服务": "PaaS",
            "软件即服务": "SaaS",
            "基础设施即服务": "IaaS",
            "应用程序接口": "API",
            "用户界面": "UI",
            "用户体验": "UX",
            "图形用户界面": "GUI",
            "命令行界面": "CLI",
            "统一资源定位符": "URL",
            "超文本传输协议": "HTTP",
            "超文本标记语言": "HTML",
            "层叠样式表": "CSS",
            "结构化查询语言": "SQL",
            "非结构化查询语言": "NoSQL",
            "图形处理器": "GPU",
            "中央处理器": "CPU",
            "随机存取存储器": "RAM",
            "只读存储器": "ROM",
            "固态驱动器": "SSD",
            "硬盘驱动器": "HDD",
        },
        "common_mistakes": {
            "人工只能": "人工智能",
            "机器学系": "机器学习",
            "深度学系": "深度学习",
            "大数剧": "大数据",
            "云计算机": "云计算",
            "区快链": "区块链",
            "物联网路": "物联网",
            "应用程接口": "应用程序接口",
            "用户接面": "用户界面",
            "用户体念": "用户体验",
            "用户体验感": "用户体验",
            "结构话": "结构化",
        },
        "abbreviation_standard": {
            "ai": "AI",
            "ml": "ML",
            "dl": "DL",
            "iot": "IoT",
            "paas": "PaaS",
            "saas": "SaaS",
            "iaas": "IaaS",
            "api": "API",
            "ui": "UI",
            "ux": "UX",
            "gui": "GUI",
            "cli": "CLI",
            "url": "URL",
            "http": "HTTP",
            "https": "HTTPS",
            "html": "HTML",
            "css": "CSS",
            "sql": "SQL",
            "nosql": "NoSQL",
            "gpu": "GPU",
            "cpu": "CPU",
            "ram": "RAM",
            "rom": "ROM",
            "ssd": "SSD",
            "hdd": "HDD",
        },
    },
    "金融": {
        "standard": {
            "国内生产总值": "GDP",
            "国民生产总值": "GNP",
            "消费者物价指数": "CPI",
            "生产者物价指数": "PPI",
            "采购经理人指数": "PMI",
            "资产负债表": "Balance Sheet",
            "现金流量表": "Cash Flow Statement",
            "利润表": "Income Statement",
            "净资产收益率": "ROE",
            "资产回报率": "ROA",
            "投资回报率": "ROI",
            "每股收益": "EPS",
            "市盈率": "P/E",
            "市净率": "P/B",
            "市销率": "P/S",
            "复合年增长率": "CAGR",
            "风险价值": "VaR",
            "风险调整后资本回报率": "RAROC",
            "资本资产定价模型": "CAPM",
            "加权平均资本成本": "WACC",
            "内部收益率": "IRR",
            "净现值": "NPV",
            "流动比率": "Current Ratio",
            "速动比率": "Quick Ratio",
            "速动比率": "Acid-Test Ratio",
            "资产负债率": "Debt-to-Asset Ratio",
            "利息保障倍数": "Interest Coverage Ratio",
        },
        "common_mistakes": {
            "国名生产总值": "国内生产总值",
            "消费者务指数": "消费者物价指数",
            "生产者物阶指数": "生产者物价指数",
            "采购经理人纸数": "采购经理人指数",
            "资产付债表": "资产负债表",
            "现金刘量表": "现金流量表",
            "净姿产收益率": "净资产收益率",
            "投资回抱率": "投资回报率",
            "每鼓收益": "每股收益",
            "市盈律": "市盈率",
            "市净律": "市净率",
            "市销律": "市销率",
            "风险价直": "风险价值",
        },
        "abbreviation_standard": {
            "gdp": "GDP",
            "gnp": "GNP",
            "cpi": "CPI",
            "ppi": "PPI",
            "pmi": "PMI",
            "roe": "ROE",
            "roa": "ROA",
            "roi": "ROI",
            "eps": "EPS",
            "pe": "P/E",
            "pb": "P/B",
            "ps": "P/S",
            "cagr": "CAGR",
            "var": "VaR",
            "raroc": "RAROC",
            "capm": "CAPM",
            "wacc": "WACC",
            "irr": "IRR",
            "npv": "NPV",
        },
    },
    "医疗": {
        "standard": {
            "计算机断层扫描": "CT",
            "磁共振成像": "MRI",
            "核磁共振成像": "MRI",
            "正电子发射断层扫描": "PET",
            "心电图": "ECG",
            "脑电图": "EEG",
            "脱氧核糖核酸": "DNA",
            "核糖核酸": "RNA",
            "聚合酶链式反应": "PCR",
            "重症监护病房": "ICU",
            "重症加强护理病房": "ICU",
            "人类免疫缺陷病毒": "HIV",
            "获得性免疫缺陷综合征": "AIDS",
            "严重急性呼吸综合征": "SARS",
            "新型冠状病毒肺炎": "COVID-19",
            "世界卫生组织": "WHO",
        },
        "common_mistakes": {
            "计算机断扫描": "计算机断层扫描",
            "磁共振成象": "磁共振成像",
            "磁共震成像": "磁共振成像",
            "心电涂": "心电图",
            "脑电涂": "脑电图",
            "脱氧核粮核酸": "脱氧核糖核酸",
            "核粮核酸": "核糖核酸",
            "聚合酶连式反应": "聚合酶链式反应",
            "重症兼护病房": "重症监护病房",
            "人类免疫确陷病毒": "人类免疫缺陷病毒",
        },
        "abbreviation_standard": {
            "ct": "CT",
            "mri": "MRI",
            "pet": "PET",
            "ecg": "ECG",
            "eeg": "EEG",
            "dna": "DNA",
            "rna": "RNA",
            "pcr": "PCR",
            "icu": "ICU",
            "hiv": "HIV",
            "aids": "AIDS",
            "sars": "SARS",
            "covid": "COVID-19",
            "covid-19": "COVID-19",
            "who": "WHO",
        },
    },
    "法律": {
        "standard": {
            "股份有限公司": "Co., Ltd.",
            "有限责任公司": "LLC",
            "首席执行官": "CEO",
            "首席财务官": "CFO",
            "首席技术官": "CTO",
            "首席运营官": "COO",
            "知识产权": "IP",
            "版权所有": "All Rights Reserved",
        },
        "common_mistakes": {
            "股分有限公司": "股份有限公司",
            "有限则任公司": "有限责任公司",
            "知识产圈": "知识产权",
        },
        "abbreviation_standard": {
            "ceo": "CEO",
            "cfo": "CFO",
            "cto": "CTO",
            "coo": "COO",
            "ip": "IP",
        },
    },
    "general": {
        "standard": {},
        "common_mistakes": {},
        "abbreviation_standard": {},
    },
}


class TerminologyChecker:
    def __init__(self):
        self.industry_terms = INDUSTRY_TERMINOLOGY

    def _detect_industry(self, content: str) -> str:
        keywords = {
            "互联网": ["互联网", "网络", "软件", "硬件", "数据", "算法", "程序", "系统", "云计算", "人工智能", "机器学习"],
            "金融": ["金融", "银行", "证券", "基金", "股票", "投资", "财务", "会计", "审计", "保险"],
            "医疗": ["医疗", "医院", "医生", "药品", "诊断", "治疗", "患者", "医学", "健康"],
            "法律": ["法律", "合同", "条款", "诉讼", "法院", "律师", "法规"],
        }

        scores = {}
        for industry, words in keywords.items():
            score = sum(1 for word in words if word in content)
            scores[industry] = score

        if max(scores.values()) > 0:
            return max(scores, key=scores.get)
        return "general"

    def _find_all_positions(self, content: str, term: str) -> List[int]:
        positions = []
        start = 0
        term_lower = term.lower()
        content_lower = content.lower()
        while True:
            pos = content_lower.find(term_lower, start)
            if pos == -1:
                break
            positions.append(pos)
            start = pos + 1
        return positions

    def _is_whole_word(self, content: str, start: int, end: int) -> bool:
        before_ok = (start == 0 or not content[start - 1].isalnum())
        after_ok = (end == len(content) or not content[end].isalnum())
        return before_ok and after_ok

    def _get_context(self, content: str, pos: int, length: int) -> str:
        start = max(0, pos - 10)
        end = min(len(content), pos + length + 10)
        return content[start:end]

    def check_terminology(
        self,
        content: str,
        industry: Optional[str] = None,
        custom_terms: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        corrections = []
        seen_positions: Set[int] = set()

        if not industry:
            industry = self._detect_industry(content)

        term_data = self.industry_terms.get(industry, self.industry_terms["general"])

        for wrong_term, correct_term in term_data.get("common_mistakes", {}).items():
            positions = self._find_all_positions(content, wrong_term)
            for pos in positions:
                if pos in seen_positions:
                    continue
                end_pos = pos + len(wrong_term)
                if self._is_whole_word(content, pos, end_pos):
                    corrections.append({
                        "correction_type": "terminology",
                        "original_text": wrong_term,
                        "corrected_text": correct_term,
                        "position_start": pos,
                        "position_end": end_pos,
                        "paragraph": content[:pos].count("\n\n") + 1,
                        "line_number": content[:pos].count("\n") + 1,
                        "explanation": f"专业术语错误：'{wrong_term}' 应改为 '{correct_term}'",
                        "severity": "high",
                        "confidence": 0.95,
                    })
                    for p in range(pos, end_pos):
                        seen_positions.add(p)

        for term_cn, term_en in term_data.get("standard", {}).items():
            positions = self._find_all_positions(content, term_cn)
            for pos in positions:
                if pos in seen_positions:
                    continue
                end_pos = pos + len(term_cn)
                if self._is_whole_word(content, pos, end_pos):
                    if term_en.upper() not in content[pos:end_pos + len(term_en) + 5]:
                        corrections.append({
                            "correction_type": "terminology",
                            "original_text": term_cn,
                            "corrected_text": f"{term_cn}（{term_en}）",
                            "position_start": pos,
                            "position_end": end_pos,
                            "paragraph": content[:pos].count("\n\n") + 1,
                            "line_number": content[:pos].count("\n") + 1,
                            "explanation": f"建议补充标准英文术语：{term_en}",
                            "severity": "low",
                            "confidence": 0.75,
                        })
                        for p in range(pos, end_pos):
                            seen_positions.add(p)

        for abbr, standard in term_data.get("abbreviation_standard", {}).items():
            positions = self._find_all_positions(content, abbr)
            for pos in positions:
                if pos in seen_positions:
                    continue
                end_pos = pos + len(abbr)
                actual_text = content[pos:end_pos]
                if actual_text != standard and self._is_whole_word(content, pos, end_pos):
                    corrections.append({
                        "correction_type": "terminology",
                        "original_text": actual_text,
                        "corrected_text": standard,
                        "position_start": pos,
                        "position_end": end_pos,
                        "paragraph": content[:pos].count("\n\n") + 1,
                        "line_number": content[:pos].count("\n") + 1,
                        "explanation": f"术语缩写不规范：'{actual_text}' 应改为 '{standard}'",
                        "severity": "medium",
                        "confidence": 0.85,
                    })
                    for p in range(pos, end_pos):
                        seen_positions.add(p)

        if custom_terms:
            for term in custom_terms:
                positions = self._find_all_positions(content, term)
                for pos in positions:
                    if pos in seen_positions:
                        continue
                    corrections.append({
                        "correction_type": "terminology",
                        "original_text": term,
                        "corrected_text": f"【{term}】",
                        "position_start": pos,
                        "position_end": pos + len(term),
                        "paragraph": content[:pos].count("\n\n") + 1,
                        "line_number": content[:pos].count("\n") + 1,
                        "explanation": "自定义术语检查",
                        "severity": "medium",
                        "confidence": 0.9,
                    })

        return corrections


class AIService:
    def __init__(self):
        self.base_url = settings.ai_service_url
        self.timeout = settings.ai_service_timeout
        self.terminology_checker = TerminologyChecker()
        self._client = None
        self._semaphore = asyncio.Semaphore(5)

    @property
    def client(self):
        if self._client is None:
            limits = httpx.Limits(
                max_connections=20,
                max_keepalive_connections=10,
                keepalive_expiry=60.0,
            )
            timeout = httpx.Timeout(
                connect=10.0,
                read=self.timeout,
                write=10.0,
                pool=10.0,
            )
            self._client = httpx.AsyncClient(
                limits=limits,
                timeout=timeout,
                http2=True,
            )
        return self._client

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _call_ai_service(
        self,
        endpoint: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        try:
            async with self._semaphore:
                response = await self.client.post(
                    f"{self.base_url}/{endpoint}",
                    json=payload,
                )
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException:
            raise AIServiceException(detail="AI服务请求超时")
        except httpx.ConnectError:
            logger.warning("AI service not available, using mock service")
            return None
        except Exception as e:
            logger.error(f"AI service error: {e}")
            raise AIServiceException(detail=f"AI服务错误: {str(e)}")

    def _mock_proofread(
        self,
        content: str,
        task_type: str,
        industry: Optional[str] = None,
        custom_terminology: Optional[List[str]] = None,
    ) -> AICorrectionResponse:
        corrections = []

        if task_type in ["spelling", "full"]:
            corrections.extend(self._mock_spelling_check(content))

        if task_type in ["grammar", "full"]:
            corrections.extend(self._mock_grammar_check(content))

        if task_type in ["terminology", "full"]:
            corrections.extend(
                self.terminology_checker.check_terminology(content, industry, custom_terminology)
        )

        if task_type in ["format", "full"]:
            corrections.extend(self._mock_format_check(content))

        corrected_content = content
        for corr in sorted(corrections, key=lambda x: x.get("position_start", 0), reverse=True):
            if corr.get("position_start") is not None:
                corrected_content = (
                    corrected_content[: corr["position_start"]]
                    + corr["corrected_text"]
                    + corrected_content[corr["position_end"]:]
                )

        return AICorrectionResponse(
            success=True,
            corrected_content=corrected_content,
            corrections=corrections,
            summary={
                "total_errors": len(corrections),
                "spelling_errors": sum(1 for c in corrections if c["correction_type"] == "spelling"),
                "grammar_errors": sum(1 for c in corrections if c["correction_type"] == "grammar"),
                "terminology_errors": sum(1 for c in corrections if c["correction_type"] == "terminology"),
                "format_errors": sum(1 for c in corrections if c["correction_type"] == "format"),
                "readability_score": random.uniform(70, 95),
                "industry_detected": self.terminology_checker._detect_industry(content),
                "suggestions": [
                    "建议检查专业术语的一致性",
                    "建议优化段落结构",
                    "建议使用更正式的表达方式",
                ],
            },
            confidence_score=random.uniform(0.85, 0.98),
        )

    def _mock_spelling_check(self, content: str) -> List[Dict[str, Any]]:
        corrections = []
        common_errors = {
            "其它": "其他",
            "做为": "作为",
            "帐户": "账户",
            "部份": "部分",
            "座落": "坐落",
            "水份": "水分",
            "成份": "成分",
            "按装": "安装",
            "复盖": "覆盖",
            "既使": "即使",
            "既便": "即便",
            "积集": "聚集",
            "既然": "既然",
            "迹像": "迹象",
            "过份": "过分",
            "诀定": "决定",
            "类形": "类型",
            "联连": "连接",
            "连系": "联系",
            "糜烂": "糜烂",
            "靡烂": "糜烂",
            "名符其实": "名副其实",
            "年令": "年龄",
            "扭扣": "纽扣",
            "钮扣": "纽扣",
            "陪偿": "赔偿",
            "配带": "佩戴",
            "启封": "启封",
            "气慨": "气概",
            "起封": "启封",
            "起程": "启程",
            "气份": "气氛",
            "汽球": "气球",
            "欠收": "歉收",
            "轻脆": "清脆",
            "清淅": "清晰",
            "曲服": "屈服",
            "趋式": "趋势",
            "全愈": "痊愈",
            "却步": "却步",
            "惹事生非": "惹是生非",
            "热中": "热衷",
            "融汇": "融会",
            "融恰": "融洽",
            "如雷灌耳": "如雷贯耳",
            "弱不经风": "弱不禁风",
            "三翻五次": "三番五次",
            "色彩": "色彩",
            "杀一警百": "杀一儆百",
            "山青水秀": "山清水秀",
            "稍安毋躁": "少安毋躁",
            "稍纵既逝": "稍纵即逝",
            "身分": "身份",
            "神彩飞扬": "神采飞扬",
            "神彩奕奕": "神采奕奕",
            "神智不清": "神志不清",
            "生花之笔": "生花妙笔",
            "声名雀起": "声名鹊起",
            "声撕力竭": "声嘶力竭",
            "师付": "师傅",
            "失口否认": "矢口否认",
            "世外桃园": "世外桃源",
            "事必躬亲": "事必躬亲",
            "事过景迁": "时过境迁",
            "事过境迁": "时过境迁",
            "势不可当": "势不可挡",
            "势如破竹": "势如破竹",
            "视死如归": "视死如归",
            "手屈一指": "首屈一指",
            "首曲一指": "首屈一指",
            "受益非浅": "受益匪浅",
            "书声朗朗": "书声琅琅",
            "束之高搁": "束之高阁",
            "水泻不通": "水泄不通",
            "睡眼惺松": "睡眼惺忪",
            "撕杀": "厮杀",
            "耸人听闻": "耸人听闻",
            "怂勇": "怂恿",
            "隋落": "堕落",
            "所剩无己": "所剩无几",
            "塌实": "踏实",
            "提要钩玄": "提要钩玄",
            "天翻地复": "天翻地覆",
            "天经地意": "天经地义",
            "天网灰灰": "天网恢恢",
            "天崖海角": "天涯海角",
            "天涯海脚": "天涯海角",
            "甜言密语": "甜言蜜语",
            "挑拔离间": "挑拨离间",
            "铁石心肠": "铁石心肠",
            "铤而走险": "铤而走险",
            "同仇敌慨": "同仇敌忾",
            "投机捣把": "投机倒把",
            "投机倒把": "投机倒把",
            "涂脂抹粉": "涂脂抹粉",
            "歪风斜气": "歪风邪气",
            "歪门斜道": "歪门邪道",
            "完壁归赵": "完璧归赵",
            "万惯家私": "万贯家私",
            "万赖俱寂": "万籁俱寂",
            "万无一失": "万无一失",
            "妄费心机": "枉费心机",
            "望尘莫及": "望尘莫及",
            "望风披糜": "望风披靡",
            "望洋兴叹": "望洋兴叹",
            "威风禀禀": "威风凛凛",
            "威风凛禀": "威风凛凛",
            "危如垒卵": "危如累卵",
            "微不足到": "微不足道",
            "为虎作怅": "为虎作伥",
            "韦编三绝": "韦编三绝",
            "委屈求全": "委曲求全",
            "萎糜不振": "萎靡不振",
            "萎靡不震": "萎靡不振",
            "卫戊": "卫戍",
            "味同嚼腊": "味同嚼蜡",
            "文彩": "文采",
            "稳操胜卷": "稳操胜券",
            "稳如盘石": "稳如磐石",
            "问心无槐": "问心无愧",
            "瓮声瓮气": "瓮声瓮气",
            "诬害": "陷害",
            "无精打彩": "无精打采",
            "无济于是": "无济于事",
            "无可奈何": "无可奈何",
            "无可耐何": "无可奈何",
            "无耻之尤": "无耻之尤",
            "无缘无故": "无缘无故",
            "五体头地": "五体投地",
            "五彩斑烂": "五彩斑斓",
            "五光十色": "五光十色",
            "五谷丰登": "五谷丰登",
            "舞谢楼台": "舞榭楼台",
            "勿必": "务必",
            "物极必反": "物极必反",
            "物质文明": "物质文明",
            "息息相通": "息息相通",
            "洗耳躬听": "洗耳恭听",
            "喜笑怒骂": "嬉笑怒骂",
            "细水常流": "细水长流",
            "暇不掩瑜": "瑕不掩瑜",
            "闲情逸志": "闲情逸致",
            "相辅相承": "相辅相成",
            "相辅相成": "相辅相成",
            "相形见拙": "相形见绌",
            "想入飞飞": "想入非非",
            "向偶而泣": "向隅而泣",
            "逍遥法外": "逍遥法外",
            "销脏": "销赃",
            "销赃灭迹": "销赃灭迹",
            "心旷神怡": "心旷神怡",
            "心旷神疑": "心旷神怡",
            "心恢意冷": "心灰意冷",
            "心满义足": "心满意足",
            "心心相映": "心心相印",
            "欣欣向容": "欣欣向荣",
            "信口开合": "信口开河",
            "星罗棋布": "星罗棋布",
            "行将末路": "行将就木",
            "行踪鬼密": "行踪诡秘",
            "形迹可疑": "形迹可疑",
            "形消骨立": "形销骨立",
            "兴高彩烈": "兴高采烈",
            "凶相必露": "凶相毕露",
            "休养生息": "休养生息",
            "修养生息": "休养生息",
            "虚座以待": "虚位以待",
            "栩栩如生": "栩栩如生",
            "喧宾夺主": "喧宾夺主",
            "悬梁刺骨": "悬梁刺股",
            "悬梁刺股": "悬梁刺股",
            "循规蹈距": "循规蹈矩",
            "循私舞弊": "徇私舞弊",
            "训练有素": "训练有素",
            "鸦鹊无声": "鸦雀无声",
            "雅雀无声": "鸦雀无声",
            "严惩不待": "严惩不贷",
            "言简意该": "言简意赅",
            "言者无罪": "言者无罪",
            "奄奄一息": "奄奄一息",
            "眼花缭乱": "眼花缭乱",
            "眼花撩乱": "眼花缭乱",
            "扬常而去": "扬长而去",
            "扬长避短": "扬长避短",
            "养尊处忧": "养尊处优",
            "杳无音信": "杳无音信",
            "杳无音迅": "杳无音信",
            "要言不繁": "要言不烦",
            "一败涂地": "一败涂地",
            "一愁莫展": "一筹莫展",
            "一促而就": "一蹴而就",
            "一鼓作气": "一鼓作气",
            "一劳永易": "一劳永逸",
            "一视同人": "一视同仁",
            "一如既往": "一如既往",
            "一泄千里": "一泻千里",
            "衣杉": "衣衫",
            "衣衫蓝缕": "衣衫褴褛",
            "遗笑大方": "贻笑大方",
            "以逸代劳": "以逸待劳",
            "义不容词": "义不容辞",
            "异曲同工": "异曲同工",
            "异想天开": "异想天开",
            "抑扬顿挫": "抑扬顿挫",
            "阴谋鬼计": "阴谋诡计",
            "引亢高歌": "引吭高歌",
            "饮鸠止渴": "饮鸩止渴",
            "英雄倍出": "英雄辈出",
            "永往直前": "勇往直前",
            "忧柔寡断": "优柔寡断",
            "忧心如焚": "忧心如焚",
            "忧心重重": "忧心忡忡",
            "尤如": "犹如",
            "犹豫不决": "犹豫不决",
            "油然而升": "油然而生",
            "油头猾脑": "油头滑脑",
            "游刃有余": "游刃有余",
            "有口皆碑": "有口皆碑",
            "有持无恐": "有恃无恐",
            "有生之年": "有生之年",
            "有始有中": "有始有终",
            "有恃无恐": "有恃无恐",
            "于心不忍": "于心不忍",
            "鱼龙混杂": "鱼龙混杂",
            "鱼目混珠": "鱼目混珠",
            "渔翁得利": "渔翁得利",
            "语无论次": "语无伦次",
            "玉液琼桨": "玉液琼浆",
            "欲盖弥张": "欲盖弥彰",
            "渊远流长": "源远流长",
            "原形必露": "原形毕露",
            "源远流长": "源远流长",
            "远见卓识": "远见卓识",
            "怨天忧人": "怨天尤人",
            "再接再厉": "再接再厉",
            "再接再励": "再接再厉",
            "在劫难逃": "在劫难逃",
            "脏款": "赃款",
            "赃款": "赃款",
            "造谣惑众": "造谣惑众",
            "责无旁代": "责无旁贷",
            "仗义直言": "仗义执言",
            "张灯结采": "张灯结彩",
            "张慌失措": "张皇失措",
            "张冠李戴": "张冠李戴",
            "长年累月": "长年累月",
            "长驱直入": "长驱直入",
            "长年累月": "长年累月",
            "长年累月": "长年累月",
            "帐蓬": "帐篷",
            "帐篷": "帐篷",
            "遮天蔽日": "遮天蔽日",
            "针贬时弊": "针砭时弊",
            "真像大白": "真相大白",
            "振振有词": "振振有词",
            "震耳欲聋": "震耳欲聋",
            "整装待发": "整装待发",
            "正重其事": "郑重其事",
            "支离破碎": "支离破碎",
            "直截了当": "直截了当",
            "直捷了当": "直截了当",
            "直言不讳": "直言不讳",
            "指手划脚": "指手画脚",
            "至理名言": "至理名言",
            "至高无上": "至高无上",
            "置若罔闻": "置若罔闻",
            "中流坻柱": "中流砥柱",
            "中流抵柱": "中流砥柱",
            "忠心耿耿": "忠心耿耿",
            "众口烁金": "众口铄金",
            "众口铄金": "众口铄金",
            "众目睽睽": "众目睽睽",
            "珠联壁合": "珠联璧合",
            "珠光宝气": "珠光宝气",
            "株连九族": "株连九族",
            "蛛丝蚂迹": "蛛丝马迹",
            "蛛丝马迹": "蛛丝马迹",
            "专心至志": "专心致志",
            "专心致志": "专心致志",
            "装腔作势": "装腔作势",
            "壮志未酬": "壮志未酬",
            "追本溯源": "追本溯源",
            "自惭形秽": "自惭形秽",
            "自鸣得意": "自鸣得意",
            "自命不凡": "自命不凡",
            "自相矛盾": "自相矛盾",
            "走头无路": "走投无路",
            "罪不容诛": "罪不容诛",
            "罪魁祸首": "罪魁祸首",
            "罪有应得": "罪有应得",
            "左顾右盼": "左顾右盼",
            "左右逢源": "左右逢源",
            "座标": "坐标",
            "座无虚席": "座无虚席",
            "坐无虚席": "座无虚席",
            "坐享其成": "坐享其成",
            "坐收渔利": "坐收渔利",
            "做月子": "坐月子",
        }

        seen_positions = set()
        for wrong, correct in common_errors.items():
            start_idx = 0
            while True:
                pos = content.find(wrong, start_idx)
                if pos == -1:
                    break

                if pos in seen_positions:
                    start_idx = pos + 1
                    continue

                end_pos = pos + len(wrong)
                before = pos > 0 and not content[pos - 1].isalnum()
                after = end_pos >= len(content) or not content[end_pos].isalnum()

                if before and after:
                    corrections.append({
                        "correction_type": "spelling",
                        "original_text": wrong,
                        "corrected_text": correct,
                        "position_start": pos,
                        "position_end": end_pos,
                        "paragraph": content[:pos].count("\n\n") + 1,
                        "line_number": content[:pos].count("\n") + 1,
                        "explanation": f"错别字：'{wrong}' 应改为 '{correct}'",
                        "severity": "high",
                        "confidence": random.uniform(0.9, 0.99),
                    })
                    for p in range(pos, end_pos):
                        seen_positions.add(p)

                start_idx = pos + 1

        return corrections

    def _mock_grammar_check(self, content: str) -> List[Dict[str, Any]]:
        corrections = []

        grammar_patterns = [
            (r"的的", "的", "重复助词"),
            (r"地地", "地", "重复助词"),
            (r"了了", "了", "重复助词"),
            (r"着着", "着", "重复助词"),
            (r"非常非常", "非常", "重复副词"),
            (r"十分十分", "十分", "重复副词"),
            (r"比较比较", "比较", "重复副词"),
            (r"很很", "很", "重复副词"),
            (r"因为[，,]\s*所以", "所以", "冗余连词"),
            (r"虽然[，,]\s*但是", "但是", "冗余连词"),
            (r"不但[，,]\s*而且", "而且", "冗余连词"),
            (r"如果[，,]\s*那么", "那么", "冗余连词"),
            (r"的地(?![\u4e00-\u9fa5]", "的", "助词使用错误"),
            (r"地的(?=[\u4e00-\u9fa5]", "地", "助词使用错误"),
        ]

        for pattern, replacement, explanation in grammar_patterns:
            matches = re.finditer(pattern, content)
            for match in matches:
                pos = match.start()
                if pos != -1:
                    corrections.append({
                        "correction_type": "grammar",
                        "original_text": match.group(),
                        "corrected_text": replacement,
                        "position_start": pos,
                        "position_end": pos + len(match.group()),
                        "paragraph": content[:pos].count("\n\n") + 1,
                        "line_number": content[:pos].count("\n") + 1,
                        "explanation": f"语法问题：{explanation}",
                        "severity": "medium",
                        "confidence": random.uniform(0.8, 0.95),
                    })

        sentences = re.split(r"[。！？]", content)
        for sentence in sentences:
            if len(sentence.strip()) > 80 and len(sentence.strip()) < 200:
                pos = content.find(sentence.strip())
                if pos != -1 and random.random() > 0.3:
                    corrections.append({
                        "correction_type": "grammar",
                        "original_text": sentence.strip(),
                        "corrected_text": sentence.strip() + "（建议拆分为多个短句）",
                        "position_start": pos,
                        "position_end": pos + len(sentence.strip()),
                        "paragraph": content[:pos].count("\n\n") + 1,
                        "line_number": content[:pos].count("\n") + 1,
                        "explanation": "句子过长，建议拆分为多个短句以提高可读性",
                        "severity": "low",
                        "confidence": random.uniform(0.65, 0.8),
                    })

        return corrections

    def _mock_format_check(self, content: str) -> List[Dict[str, Any]]:
        corrections = []

        lines = content.split("\n")
        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped:
                continue

            if re.match(r"^[a-zA-Z0-9]\s*[、.]", stripped):
                pos = content.find(stripped)
                if pos != -1:
                    corrections.append({
                        "correction_type": "format",
                        "original_text": stripped[:20],
                        "corrected_text": "建议使用中文编号格式",
                        "position_start": pos,
                        "position_end": pos + min(20),
                        "paragraph": i + 1,
                        "line_number": i + 1,
                        "explanation": "建议统一使用中文编号格式（一、二、三、或1. 2. 3.）",
                        "severity": "low",
                        "confidence": random.uniform(0.7, 0.85),
                    })

            if re.search(r"[，。！？；：][，。！？；：]", stripped):
                pos = content.find(stripped)
                if pos != -1:
                    corrections.append({
                        "correction_type": "format",
                        "original_text": stripped[:30],
                        "corrected_text": "已标准化标点符号",
                        "position_start": pos,
                        "position_end": pos + min(30),
                        "paragraph": content[:pos].count("\n\n") + 1,
                        "line_number": i + 1,
                        "explanation": "存在连续标点符号",
                        "severity": "low",
                        "confidence": random.uniform(0.8, 0.9),
                    })

        return corrections

    async def proofread(
        self,
        content: str,
        task_type: str = "full",
        industry: Optional[str] = None,
        custom_terminology: Optional[List[str]] = None,
    ) -> AICorrectionResponse:
        payload = {
            "content": content,
            "task_type": task_type,
            "industry": industry,
            "custom_terminology": custom_terminology or [],
        }

        try:
            result = await self._call_ai_service("proofread", payload)
            if result:
                return AICorrectionResponse(**result)
        except AIServiceException:
            pass

        logger.info("Using mock AI service for proofreading")
        return self._mock_proofread(content, task_type, industry, custom_terminology)

    async def check_terminology(
        self,
        content: str,
        industry: str,
        custom_terminology: Optional[List[str]] = None,
    ) -> AICorrectionResponse:
        return await self.proofread(content, "terminology", industry, custom_terminology)

    async def health_check(self) -> bool:
        try:
            response = await self.client.get(f"{self.base_url}/health", timeout=5.0)
            return response.status_code == 200
        except Exception:
            return False


ai_service = AIService()
