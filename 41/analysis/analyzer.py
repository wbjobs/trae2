import sys
import os
from typing import List, Tuple
import numpy as np

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared import settings, PVStringData, StringAnalysis, Alert, AlertLevel


class StringDataAnalyzer:
    def __init__(self):
        self.voltage_range = (settings.VOLTAGE_MIN, settings.VOLTAGE_MAX)
        self.current_range = (settings.CURRENT_MIN, settings.CURRENT_MAX)
        self.temp_range = (settings.TEMP_MIN, settings.TEMP_MAX)

    def analyze_string(self, data: PVStringData, history: List[PVStringData] = None) -> Tuple[StringAnalysis, List[Alert]]:
        alerts = []
        
        voltage_normal = self.voltage_range[0] <= data.voltage <= self.voltage_range[1]
        current_normal = self.current_range[0] <= data.current <= self.current_range[1]
        temp_normal = self.temp_range[0] <= data.temperature <= self.temp_range[1]

        if not voltage_normal:
            alerts.append(self._create_alert(
                data.string_id, "voltage", data.voltage,
                self.voltage_range[0] if data.voltage < self.voltage_range[0] else self.voltage_range[1]
            ))

        if not current_normal:
            alerts.append(self._create_alert(
                data.string_id, "current", data.current,
                self.current_range[0] if data.current < self.current_range[0] else self.current_range[1]
            ))

        if not temp_normal:
            alerts.append(self._create_alert(
                data.string_id, "temperature", data.temperature,
                self.temp_range[0] if data.temperature < self.temp_range[0] else self.temp_range[1]
            ))

        efficiency = self._calculate_efficiency(data, history)

        if efficiency < 0.7:
            alerts.append(Alert(
                alert_id=f"alert-eff-{data.string_id}-{int(data.timestamp.timestamp())}",
                level=AlertLevel.WARNING,
                device_id=data.string_id,
                device_name=f"组串{data.string_id}",
                message=f"发电效率异常: {efficiency:.1%}",
                parameter="efficiency",
                value=efficiency,
                threshold=0.7
            ))

        overall_status = "normal"
        if not (voltage_normal and current_normal and temp_normal):
            overall_status = "warning"
        if efficiency < 0.5:
            overall_status = "error"

        recommendations = self._generate_recommendations(voltage_normal, current_normal, temp_normal, efficiency)

        analysis = StringAnalysis(
            string_id=data.string_id,
            voltage_normal=voltage_normal,
            current_normal=current_normal,
            temp_normal=temp_normal,
            overall_status=overall_status,
            efficiency=efficiency,
            recommendations=recommendations
        )

        return analysis, alerts

    def _create_alert(self, string_id: str, param: str, value: float, threshold: float) -> Alert:
        level = AlertLevel.WARNING
        if param == "temperature" and value > 80:
            level = AlertLevel.CRITICAL
        elif param == "voltage" and (value < 300 or value > 900):
            level = AlertLevel.ERROR

        param_names = {
            "voltage": "电压",
            "current": "电流",
            "temperature": "温度"
        }
        units = {"voltage": "V", "current": "A", "temperature": "°C"}

        return Alert(
            alert_id=f"alert-{param}-{string_id}-{int(np.datetime64('now').astype('uint64') // 10**9)}",
            level=level,
            device_id=string_id,
            device_name=f"组串{string_id}",
            message=f"{param_names[param]}异常: {value}{units[param]}",
            parameter=param,
            value=value,
            threshold=threshold
        )

    def _calculate_efficiency(self, data: PVStringData, history: List[PVStringData] = None) -> float:
        if not data.power:
            data.calculate_power()
        
        rated_power = 600.0 * 10.0
        actual_power = data.power if data.power else 0
        
        efficiency = min(actual_power / rated_power, 1.0) if rated_power > 0 else 0
        
        if history and len(history) > 0:
            avg_power = np.mean([d.power if d.power else d.voltage * d.current for d in history])
            if avg_power > 0:
                efficiency = min(efficiency * (actual_power / avg_power if avg_power > 0 else 1), 1.0)
        
        return efficiency

    def _generate_recommendations(self, v_ok: bool, c_ok: bool, t_ok: bool, eff: float) -> List[str]:
        recommendations = []
        
        if not v_ok:
            recommendations.append("检查组串连接是否松动，排查组件遮挡情况")
        
        if not c_ok:
            recommendations.append("检查逆变器MPPT跟踪状态，确认组串无短路")
        
        if not t_ok:
            recommendations.append("检查组件散热情况，必要时清洁组件表面")
        
        if eff < 0.7:
            recommendations.append("建议进行组件性能测试，排查老化或损坏组件")
        
        if eff > 0.9:
            recommendations.append("运行状态良好，继续保持日常巡检")
        
        return recommendations

    def analyze_batch(self, data_list: List[PVStringData]) -> dict:
        if not data_list:
            return {"count": 0, "avg_efficiency": 0}
        
        efficiencies = []
        for data in data_list:
            if not data.power:
                data.calculate_power()
            efficiencies.append(self._calculate_efficiency(data))
        
        return {
            "count": len(data_list),
            "avg_efficiency": np.mean(efficiencies),
            "min_efficiency": np.min(efficiencies),
            "max_efficiency": np.max(efficiencies),
            "std_efficiency": np.std(efficiencies)
        }


analyzer = StringDataAnalyzer()
