# -*- coding: utf-8 -*-
"""
标定报告输出服务
Generate calibration reports in multiple formats (JSON, PDF, HTML).
"""

import json
import os
from typing import Dict, Any, Optional, List
from datetime import datetime


class ReportService:
    """标定报告生成服务"""

    def __init__(self, output_dir: str = "output"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def generate_report_data(
        self,
        calibration_result: Dict[str, Any],
        spectrum_data: Dict[str, Any],
        parameters: Dict[str, Any],
        metrics: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """生成报告数据结构"""
        report = {
            "report_info": {
                "title": "光谱分析仪参数标定报告",
                "report_id": f"CAL-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
                "generated_at": datetime.now().isoformat(),
                "analyst": "自动标定系统"
            },
            "device_info": parameters.get("device", {}) if isinstance(parameters, dict) else {},
            "optical_config": parameters.get("optical", {}) if isinstance(parameters, dict) else {},
            "calibration_setup": parameters.get("calibration", {}) if isinstance(parameters, dict) else {},
            "spectrum_summary": {
                "pixel_count": len(spectrum_data.get("wavelengths", [])),
                "wavelength_range": [
                    min(spectrum_data.get("wavelengths", [0])) if len(spectrum_data.get("wavelengths", [])) > 0 else 0.0,
                    max(spectrum_data.get("wavelengths", [0])) if len(spectrum_data.get("wavelengths", [])) > 0 else 0.0
                ],
                "peak_count": len(spectrum_data.get("peaks", [])),
                "peaks": spectrum_data.get("peaks", [])
            },
            "calibration_results": calibration_result if isinstance(calibration_result, dict) else {},
            "performance_metrics": metrics if isinstance(metrics, dict) else {},
            "conclusions": self._generate_conclusions(
                calibration_result if isinstance(calibration_result, dict) else {},
                metrics if isinstance(metrics, dict) else {}
            ),
            "recommendations": self._generate_recommendations(
                calibration_result if isinstance(calibration_result, dict) else {},
                metrics if isinstance(metrics, dict) else {}
            )
        }
        return report

    def _generate_conclusions(
        self,
        calibration_result: Dict[str, Any],
        metrics: Optional[Dict[str, Any]]
    ) -> List[str]:
        """生成标定结论"""
        conclusions = []

        wl_cal = calibration_result.get("wavelength_calibration", {})
        if wl_cal and isinstance(wl_cal, dict) and wl_cal.get("status") == "success":
            wl_rmse = wl_cal.get("wavelength_rmse", 0.0)
            if isinstance(wl_rmse, (int, float)):
                conclusions.append(f"波长标定完成，RMSE: {wl_rmse:.4f} nm")
            else:
                conclusions.append("波长标定完成")

            if metrics and isinstance(metrics, dict):
                wl_acc = metrics.get("wavelength_accuracy_nm", 0.0)
                if isinstance(wl_acc, (int, float)):
                    if wl_acc < 0.05:
                        conclusions.append("波长精度优秀，满足高精度测量要求")
                    elif wl_acc < 0.1:
                        conclusions.append("波长精度良好，满足常规测量要求")
                    else:
                        conclusions.append("波长精度需改进，建议重新标定")

        int_cal = calibration_result.get("intensity_calibration", {})
        if int_cal and isinstance(int_cal, dict):
            int_status = int_cal.get("status", "")
        else:
            int_status = ""

        if int_status == "success":
            conclusions.append("强度标定完成")

            if metrics and isinstance(metrics, dict):
                int_acc = metrics.get("intensity_accuracy_pct", 0.0)
                if isinstance(int_acc, (int, float)):
                    if int_acc < 1.0:
                        conclusions.append("强度精度优秀")
                    elif int_acc < 3.0:
                        conclusions.append("强度精度良好")
                    else:
                        conclusions.append("强度精度需改进")

        if not conclusions:
            conclusions.append("标定未完成或结果无效")

        return conclusions

    def _generate_recommendations(
        self,
        calibration_result: Dict[str, Any],
        metrics: Optional[Dict[str, Any]]
    ) -> List[str]:
        """生成建议"""
        recommendations = []

        wl_cal = calibration_result.get("wavelength_calibration", {})
        if wl_cal and isinstance(wl_cal, dict) and wl_cal.get("status") == "success":
            wl_rmse = wl_cal.get("wavelength_rmse", 0.0)
            if isinstance(wl_rmse, (int, float)) and wl_rmse > 0.1:
                recommendations.append("建议清洁光栅和光学元件以提高波长精度")

        if metrics and isinstance(metrics, dict):
            snr = metrics.get("snr", 0.0)
            if isinstance(snr, (int, float)) and snr < 100:
                recommendations.append("信噪比偏低，建议增加积分时间或使用更强的光源")

            r2 = metrics.get("linearity_r2", 0.0)
            if isinstance(r2, (int, float)) and r2 < 0.99:
                recommendations.append("响应线性度不足，建议进行多点标定")

        if not recommendations:
            recommendations.append("设备状态良好，无需特殊维护")

        recommendations.append("建议每12个月进行一次完整标定")
        return recommendations

    def export_json_report(
        self,
        report_data: Dict[str, Any],
        filename: Optional[str] = None
    ) -> str:
        """导出 JSON 格式报告"""
        if filename is None:
            filename = f"calibration_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        filepath = os.path.join(self.output_dir, filename)

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)

        return filepath

    def export_html_report(
        self,
        report_data: Dict[str, Any],
        filename: Optional[str] = None
    ) -> str:
        """导出 HTML 格式报告"""
        if filename is None:
            filename = f"calibration_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
        filepath = os.path.join(self.output_dir, filename)

        html = self._render_html(report_data)

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(html)

        return filepath

    def _render_html(self, data: Dict[str, Any]) -> str:
        """渲染 HTML 报告"""
        info = data.get("report_info", {})
        device = data.get("device_info", {})
        spectrum = data.get("spectrum_summary", {})
        metrics = data.get("performance_metrics", {})
        conclusions = data.get("conclusions", [])
        recommendations = data.get("recommendations", [])

        wl_cal = data.get("calibration_results", {}).get("wavelength_calibration", {})
        int_cal = data.get("calibration_results", {}).get("intensity_calibration", {})

        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{info.get('title', '标定报告')}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #f5f7fa; color: #333; line-height: 1.6; }}
        .container {{ max-width: 1100px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 24px; }}
        .header h1 {{ font-size: 28px; margin-bottom: 8px; }}
        .header .subtitle {{ opacity: 0.9; font-size: 14px; }}
        .section {{ background: white; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }}
        .section h2 {{ font-size: 20px; color: #2c3e50; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #eef; }}
        .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }}
        .info-item {{ padding: 12px; background: #f8f9fa; border-radius: 8px; }}
        .info-label {{ font-size: 12px; color: #888; text-transform: uppercase; }}
        .info-value {{ font-size: 16px; font-weight: 600; color: #2c3e50; margin-top: 4px; }}
        .metric-card {{ background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 20px; border-radius: 10px; }}
        .metric-label {{ font-size: 12px; opacity: 0.9; }}
        .metric-value {{ font-size: 32px; font-weight: 700; margin: 8px 0; }}
        .metric-unit {{ font-size: 14px; opacity: 0.8; }}
        .status-success {{ color: #28a745; font-weight: 600; }}
        .status-failed {{ color: #dc3545; font-weight: 600; }}
        ul.conclusions, ul.recommendations {{ list-style: none; }}
        ul.conclusions li, ul.recommendations li {{ padding: 10px 16px; background: #e8f5e9; border-left: 4px solid #4caf50; margin-bottom: 8px; border-radius: 0 6px 6px 0; }}
        ul.recommendations li {{ background: #fff3e0; border-left-color: #ff9800; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
        th, td {{ padding: 10px 12px; text-align: left; border-bottom: 1px solid #eef; }}
        th {{ background: #f8f9fa; font-weight: 600; color: #555; font-size: 13px; text-transform: uppercase; }}
        .footer {{ text-align: center; color: #999; font-size: 12px; padding: 20px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{info.get('title', '光谱分析仪参数标定报告')}</h1>
            <div class="subtitle">
                报告编号: {info.get('report_id', 'N/A')} |
                生成时间: {info.get('generated_at', 'N/A')}
            </div>
        </div>

        <div class="section">
            <h2>设备信息</h2>
            <div class="grid">
                <div class="info-item">
                    <div class="info-label">设备ID</div>
                    <div class="info-value">{device.get('device_id', 'N/A')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">设备名称</div>
                    <div class="info-value">{device.get('device_name', 'N/A')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">波长范围 (nm)</div>
                    <div class="info-value">{str(device.get('wavelength_range_nm', 'N/A'))}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">分辨率 (nm)</div>
                    <div class="info-value">{device.get('resolution_nm', 'N/A')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">探测器类型</div>
                    <div class="info-value">{device.get('detector_type', 'N/A')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">像素数量</div>
                    <div class="info-value">{device.get('pixel_count', 'N/A')}</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>性能指标</h2>
            <div class="grid">
                <div class="metric-card">
                    <div class="metric-label">波长精度</div>
                    <div class="metric-value">{metrics.get('wavelength_accuracy_nm', 0):.4f}</div>
                    <div class="metric-unit">nm</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">强度精度</div>
                    <div class="metric-value">{metrics.get('intensity_accuracy_pct', 0):.2f}</div>
                    <div class="metric-unit">%</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">线性度 R²</div>
                    <div class="metric-value">{metrics.get('linearity_r2', 0):.4f}</div>
                    <div class="metric-unit"></div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">信噪比</div>
                    <div class="metric-value">{metrics.get('snr', 0):.1f}</div>
                    <div class="metric-unit">dB</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>标定结果</h2>
            <div class="grid">
                <div class="info-item">
                    <div class="info-label">波长标定状态</div>
                    <div class="info-value">
                        <span class="{'status-success' if wl_cal.get('status') == 'success' else 'status-failed'}">
                            {'成功' if wl_cal.get('status') == 'success' else '失败'}
                        </span>
                    </div>
                </div>
                <div class="info-item">
                    <div class="info-label">波长标定 RMSE</div>
                    <div class="info-value">{wl_cal.get('wavelength_rmse', 0):.4f} nm</div>
                </div>
                <div class="info-item">
                    <div class="info-label">强度标定状态</div>
                    <div class="info-value">
                        <span class="{'status-success' if int_cal.get('status') == 'success' else 'status-failed'}">
                            {'成功' if int_cal.get('status') == 'success' else '失败'}
                        </span>
                    </div>
                </div>
                <div class="info-item">
                    <div class="info-label">检测峰值数量</div>
                    <div class="info-value">{spectrum.get('peak_count', 0)}</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>标定结论</h2>
            <ul class="conclusions">
                {"".join(f'<li>{c}</li>' for c in conclusions)}
            </ul>
        </div>

        <div class="section">
            <h2>建议与维护</h2>
            <ul class="recommendations">
                {"".join(f'<li>{r}</li>' for r in recommendations)}
            </ul>
        </div>

        <div class="footer">
            <p>光谱分析仪标定系统 | {info.get('generated_at', '')}</p>
        </div>
    </div>
</body>
</html>"""
        return html

    def get_report_preview(self, report_data: Dict[str, Any]) -> Dict[str, Any]:
        """获取报告预览数据"""
        if not isinstance(report_data, dict):
            return {
                "summary": {
                    "report_id": "",
                    "device_id": "",
                    "conclusions_count": 0,
                    "has_wavelength_cal": False,
                    "has_intensity_cal": False
                },
                "conclusions": [],
                "metrics": {}
            }

        cal_results = report_data.get("calibration_results", {})
        has_wl = False
        has_int = False
        if isinstance(cal_results, dict):
            wl_cal = cal_results.get("wavelength_calibration", {})
            int_cal = cal_results.get("intensity_calibration", {})
            has_wl = (isinstance(wl_cal, dict) and wl_cal.get("status") == "success")
            has_int = (isinstance(int_cal, dict) and int_cal.get("status") == "success")

        return {
            "summary": {
                "report_id": report_data.get("report_info", {}).get("report_id", "") if isinstance(report_data.get("report_info"), dict) else "",
                "device_id": report_data.get("device_info", {}).get("device_id", "") if isinstance(report_data.get("device_info"), dict) else "",
                "conclusions_count": len(report_data.get("conclusions", [])),
                "has_wavelength_cal": has_wl,
                "has_intensity_cal": has_int
            },
            "conclusions": report_data.get("conclusions", []) if isinstance(report_data.get("conclusions"), list) else [],
            "metrics": report_data.get("performance_metrics", {}) if isinstance(report_data.get("performance_metrics"), dict) else {}
        }
