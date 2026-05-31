import json
import os


DEFECT_TYPES = [
    {"code": "D001", "name": "绝缘老化", "category": "绝缘缺陷",
     "keywords": ["绝缘", "老化", "龟裂", "脱落", "粉化", "碳化"]},
    {"code": "D002", "name": "温度异常", "category": "热缺陷",
     "keywords": ["过热", "高温", "发烫", "温升", "发热", "烧损", "冒烟"]},
    {"code": "D003", "name": "放电故障", "category": "电气缺陷",
     "keywords": ["放电", "电弧", "闪络", "击穿", "火花", "异响", "噼啪"]},
    {"code": "D004", "name": "渗漏油", "category": "密封缺陷",
     "keywords": ["渗油", "漏油", "油位", "油浸", "油污", "滴漏"]},
    {"code": "D005", "name": "机械损伤", "category": "结构缺陷",
     "keywords": ["变形", "断裂", "松动", "脱落", "锈蚀", "磨损", "裂纹"]},
    {"code": "D006", "name": "接地异常", "category": "接地缺陷",
     "keywords": ["接地", "接地线", "接地电阻", "锈蚀", "断裂", "虚接"]},
    {"code": "D007", "name": "开关拒动", "category": "操作缺陷",
     "keywords": ["拒动", "拒合", "拒分", "卡涩", "失灵", "不动作"]},
    {"code": "D008", "name": "保护误动", "category": "保护缺陷",
     "keywords": ["误动", "误跳", "误报", "误发信号", "保护动作"]},
    {"code": "D009", "name": "表计异常", "category": "测量缺陷",
     "keywords": ["指示异常", "表计", "读数", "偏差", "不准", "失灵"]},
    {"code": "D010", "name": "外观异常", "category": "外观缺陷",
     "keywords": ["变色", "生锈", "腐蚀", "脏污", "破损", "缺失", "鸟巢"]},
]


REMEDIATION_TEMPLATES = [
    {
        "defect_code": "D001",
        "level": "major",
        "measures": [
            "立即安排停电检查绝缘状态",
            "使用绝缘电阻测试仪测量绝缘电阻值",
            "根据老化程度决定是否更换绝缘部件",
            "加强该设备巡检频次至每周一次",
        ],
        "deadline_hours": 48,
        "responsible_dept": "检修部",
    },
    {
        "defect_code": "D002",
        "level": "critical",
        "measures": [
            "紧急安排红外测温复测确认温度值",
            "检查接触部位是否松动或氧化",
            "评估负荷电流是否超出额定值",
            "必要时停电处理，更换发热部件",
            "设置临时监控装置持续跟踪",
        ],
        "deadline_hours": 24,
        "responsible_dept": "运维部",
    },
    {
        "defect_code": "D003",
        "level": "critical",
        "measures": [
            "紧急停电隔离故障设备",
            "使用局部放电检测仪精确定位放电点",
            "检查电气间隙和爬电距离是否符合标准",
            "更换受损绝缘部件，清理放电痕迹",
            "恢复送电后进行耐压试验验证",
        ],
        "deadline_hours": 12,
        "responsible_dept": "检修部",
    },
    {
        "defect_code": "D004",
        "level": "major",
        "measures": [
            "标记渗漏油位置和范围",
            "检查密封件状态，确定渗漏原因",
            "补充绝缘油至正常油位",
            "更换密封垫或修复渗漏点",
            "跟踪油位变化趋势",
        ],
        "deadline_hours": 48,
        "responsible_dept": "检修部",
    },
    {
        "defect_code": "D005",
        "level": "major",
        "measures": [
            "评估机械损伤对设备安全运行的影响",
            "更换或修复受损结构件",
            "紧固松动的连接件",
            "对锈蚀部位进行除锈防腐处理",
        ],
        "deadline_hours": 72,
        "responsible_dept": "检修部",
    },
    {
        "defect_code": "D006",
        "level": "major",
        "measures": [
            "测量接地电阻值确认是否超标",
            "检查接地线连接是否牢固",
            "修复或更换锈蚀断裂的接地线",
            "重新紧固接地连接点",
        ],
        "deadline_hours": 48,
        "responsible_dept": "运维部",
    },
    {
        "defect_code": "D007",
        "level": "critical",
        "measures": [
            "检查操作机构是否卡涩",
            "检查控制回路是否正常",
            "检查合闸/分闸线圈是否完好",
            "进行开关动作特性试验",
            "必要时更换操作机构",
        ],
        "deadline_hours": 24,
        "responsible_dept": "检修部",
    },
    {
        "defect_code": "D008",
        "level": "major",
        "measures": [
            "调取保护动作日志分析原因",
            "检查保护定值是否合理",
            "检查CT/PT二次回路是否正常",
            "排查外部干扰源",
        ],
        "deadline_hours": 48,
        "responsible_dept": "保护部",
    },
    {
        "defect_code": "D009",
        "level": "general",
        "measures": [
            "现场核对表计指示与实际值",
            "校验表计精度是否满足要求",
            "更换不合格的表计",
            "检查测量回路是否正常",
        ],
        "deadline_hours": 72,
        "responsible_dept": "运维部",
    },
    {
        "defect_code": "D010",
        "level": "general",
        "measures": [
            "清洁设备表面脏污",
            "修复破损的防护设施",
            "清理鸟巢等异物",
            "进行防腐除锈处理",
            "加强日常维护保养",
        ],
        "deadline_hours": 168,
        "responsible_dept": "运维部",
    },
]


SEVERITY_KEYWORDS = {
    "critical": ["紧急", "严重", "危险", "冒烟", "火花", "击穿", "放电", "爆炸"],
    "major": ["异常", "超标", "老化", "漏油", "发热", "拒动", "误动", "断裂"],
    "minor": ["轻微", "一般", "外观", "脏污", "变色", "锈蚀"],
    "normal": ["正常", "良好", "合格", "无异", "完好"],
}


INTENT_PATTERNS = {
    "defect_report": ["发现", "异常", "缺陷", "故障", "问题", "损坏", "不对", "有问题"],
    "status_check": ["检查", "查看", "确认", "核实", "巡视", "查看一下"],
    "maintenance_request": ["需要", "维修", "更换", "处理", "整改", "修理"],
    "alarm_report": ["报警", "告警", "跳闸", "动作", "信号", "故障灯"],
}


def init_data_dir(data_dir: str = "./data") -> None:
    os.makedirs(data_dir, exist_ok=True)
    kb_path = os.path.join(data_dir, "defect_kb.json")
    if not os.path.exists(kb_path):
        with open(kb_path, "w", encoding="utf-8") as f:
            json.dump(DEFECT_TYPES, f, ensure_ascii=False, indent=2)
    tpl_path = os.path.join(data_dir, "remediation_templates.json")
    if not os.path.exists(tpl_path):
        with open(tpl_path, "w", encoding="utf-8") as f:
            json.dump(REMEDIATION_TEMPLATES, f, ensure_ascii=False, indent=2)
