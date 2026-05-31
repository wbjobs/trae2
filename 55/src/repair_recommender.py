"""
维修方案推荐模块
负责根据匹配的故障类型推荐相应的维修方案
"""

import json
import os
from typing import List, Optional, Dict
from loguru import logger

from src.models import (
    RepairSolution,
    RepairRecommendation,
    FaultMatchResult,
    FaultType
)


class RepairRecommender:
    def __init__(self, config: dict = None):
        self.config = config or {}
        self.solutions_file = self.config.get("solutions_file", "./data/repair_solutions.json")
        self.max_recommendations = self.config.get("max_recommendations", 3)
        self._solutions_data: Dict[str, List[dict]] = {}
        self._load_solutions()

    def _load_solutions(self):
        try:
            if not os.path.exists(self.solutions_file):
                logger.warning(f"维修方案文件不存在: {self.solutions_file}")
                self._solutions_data = self._get_default_solutions()
                return

            with open(self.solutions_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            solutions_list = data.get("repair_solutions", [])
            for item in solutions_list:
                fault_type_id = item["fault_type_id"]
                solutions = item.get("solutions", [])
                self._solutions_data[fault_type_id] = solutions

            logger.info(f"加载维修方案: {len(self._solutions_data)} 种故障类型的方案")

        except Exception as e:
            logger.error(f"加载维修方案失败: {str(e)}")
            self._solutions_data = self._get_default_solutions()

    def _get_default_solutions(self) -> Dict[str, List[dict]]:
        return {
            "FT001": [
                {
                    "id": "RS001",
                    "title": "检查电机负载情况",
                    "description": "检查电机是否过载运行，测量工作电流是否在额定范围内",
                    "priority": 1,
                    "estimated_time": "15分钟",
                    "tools": ["电流表", "万用表"],
                    "steps": [
                        "切断设备电源，确保安全",
                        "使用电流表测量电机三相电流",
                        "对比额定电流值，判断是否过载",
                        "如过载，检查传动系统是否顺畅，减少负载"
                    ]
                }
            ],
            "FT002": [
                {
                    "id": "RS004",
                    "title": "更换轴承",
                    "description": "拆卸损坏的轴承，更换同型号新轴承，并加注润滑脂",
                    "priority": 1,
                    "estimated_time": "60分钟",
                    "tools": ["轴承拉马", "铜棒", "润滑脂", "密封件"],
                    "steps": [
                        "切断设备电源，挂牌上锁",
                        "拆卸轴承端盖和密封件",
                        "使用轴承拉马取出旧轴承",
                        "检查轴径和轴承座是否损坏",
                        "安装新轴承并加注润滑脂",
                        "恢复安装并试运转"
                    ]
                }
            ]
        }

    def recommend(self, fault_matches: List[FaultMatchResult]) -> Optional[RepairRecommendation]:
        try:
            if not fault_matches:
                logger.warning("没有故障匹配结果，无法推荐维修方案")
                return None

            best_match = fault_matches[0]
            fault_type = best_match.fault_type
            fault_type_id = fault_type.id

            solutions_data = self._solutions_data.get(fault_type_id, [])

            if not solutions_data:
                logger.warning(f"故障类型 {fault_type_id} 没有维修方案")
                solutions_data = self._get_generic_solutions(fault_type)

            solutions = []
            for sol_data in solutions_data[:self.max_recommendations]:
                solution = RepairSolution(
                    id=sol_data["id"],
                    title=sol_data["title"],
                    description=sol_data["description"],
                    priority=sol_data["priority"],
                    estimated_time=sol_data["estimated_time"],
                    tools=sol_data.get("tools", []),
                    steps=sol_data.get("steps", [])
                )
                solutions.append(solution)

            recommendation = RepairRecommendation(
                fault_type_id=fault_type_id,
                fault_type_name=fault_type.name,
                solutions=solutions
            )

            logger.info(f"维修方案推荐完成: 故障类型={fault_type.name}, "
                        f"方案数={len(solutions)}")
            return recommendation

        except Exception as e:
            logger.error(f"维修方案推荐失败: {str(e)}")
            return None

    def _get_generic_solutions(self, fault_type: FaultType) -> List[dict]:
        return [
            {
                "id": "GEN001",
                "title": "基础检查流程",
                "description": f"针对{fault_type.name}的通用排查和处理步骤",
                "priority": 1,
                "estimated_time": "30分钟",
                "tools": ["基础工具"],
                "steps": [
                    f"确认{fault_type.name}现象是否存在",
                    "检查设备运行状态",
                    "查看相关仪表和传感器读数",
                    "根据实际情况进行调整或维修"
                ]
            },
            {
                "id": "GEN002",
                "title": "联系专业维修人员",
                "description": "如无法自行解决，请联系专业维修人员",
                "priority": 2,
                "estimated_time": "待定",
                "tools": [],
                "steps": [
                    "记录故障现象和相关信息",
                    "联系设备供应商或专业维修人员",
                    "提供详细的故障描述和设备信息",
                    "等待专业人员处理"
                ]
            }
        ]

    def recommend_for_fault_type(self, fault_type_id: str) -> Optional[RepairRecommendation]:
        try:
            from fault_matcher import FaultMatcher
            solutions_data = self._solutions_data.get(fault_type_id, [])

            if not solutions_data:
                logger.warning(f"故障类型 {fault_type_id} 没有维修方案")
                return None

            solutions = []
            for sol_data in solutions_data[:self.max_recommendations]:
                solution = RepairSolution(
                    id=sol_data["id"],
                    title=sol_data["title"],
                    description=sol_data["description"],
                    priority=sol_data["priority"],
                    estimated_time=sol_data["estimated_time"],
                    tools=sol_data.get("tools", []),
                    steps=sol_data.get("steps", [])
                )
                solutions.append(solution)

            return RepairRecommendation(
                fault_type_id=fault_type_id,
                fault_type_name=fault_type_id,
                solutions=solutions
            )

        except Exception as e:
            logger.error(f"推荐维修方案失败: {str(e)}")
            return None

    def get_all_solutions(self) -> Dict[str, List[dict]]:
        return self._solutions_data

    def get_solutions_by_fault_type(self, fault_type_id: str) -> List[dict]:
        return self._solutions_data.get(fault_type_id, [])