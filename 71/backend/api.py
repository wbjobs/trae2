# -*- coding: utf-8 -*-
"""
Flask API 入口 - 本地后台服务
Local backend service for spectrum analyzer calibration simulation.
Provides REST API endpoints for parameter management, simulation,
calibration, and report generation.
"""

import sys
import os
import json
import time
import logging
from datetime import datetime
from typing import Dict, Any, Optional

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.computation_service import ComputationService
from services.report_service import ReportService
from services.batch_calibration_service import BatchCalibrationService
from services.recording_service import RecordingService
from core.parameter_parser import ParameterParser

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder=None)
CORS(app)

computation = ComputationService()
report_service = ReportService(output_dir=os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "output"
))
batch_service = BatchCalibrationService(storage_dir=os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "scenarios"
))
recording_service = RecordingService(storage_dir=os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "recordings"
))


@app.route("/api/health", methods=["GET"])
def health_check():
    """健康检查"""
    return jsonify({
        "status": "healthy",
        "service": "spectrum-calibration-backend",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    })


@app.route("/api/parameters", methods=["POST"])
def load_parameters():
    """加载参数"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "请求数据为空"}), 400

    result = computation.load_parameters(data=data)
    return jsonify(result)


@app.route("/api/parameters/file", methods=["POST"])
def load_parameters_from_file():
    """从文件加载参数"""
    data = request.get_json()
    filepath = data.get("filepath") if data else None

    if not filepath:
        return jsonify({"error": "文件路径为空"}), 400

    if not os.path.exists(filepath):
        return jsonify({"error": f"文件不存在: {filepath}"}), 404

    result = computation.load_parameters(filepath=filepath)
    return jsonify(result)


@app.route("/api/parameters/validate", methods=["POST"])
def validate_parameters():
    """验证参数"""
    data = request.get_json()
    if data:
        computation.load_parameters(data=data)

    parser = computation.parser
    parsed = parser.parse_all()
    validation = parser.validate()

    return jsonify({
        "parameters": parsed,
        "validation": validation
    })


@app.route("/api/parameters/presets/device", methods=["GET"])
def get_device_presets():
    """获取设备预设"""
    presets = computation.get_device_presets()
    return jsonify(presets)


@app.route("/api/parameters/presets/optical", methods=["GET"])
def get_optical_presets():
    """获取光学预设"""
    presets = computation.get_optical_presets()
    return jsonify(presets)


@app.route("/api/wavelength-axis", methods=["GET"])
def get_wavelength_axis():
    """获取波长轴"""
    try:
        axis = computation.get_wavelength_axis()
        return jsonify({
            "wavelengths": axis,
            "count": len(axis),
            "range": [axis[0], axis[-1]] if axis else []
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/simulate/optical-path", methods=["POST"])
def simulate_optical_path():
    """仿真单波长光路"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "请求数据为空"}), 400

    wavelength = data.get("wavelength_nm")
    if wavelength is None:
        return jsonify({"error": "缺少波长参数"}), 400

    optical_params = data.get("optical_params")
    device_params = data.get("device_params")

    try:
        result = computation.simulate_optical_path(
            wavelength, optical_params, device_params
        )
        return jsonify(result)
    except Exception as e:
        logger.error(f"光路仿真失败: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/simulate/spectrum", methods=["POST"])
def simulate_spectrum():
    """仿真完整光谱"""
    data = request.get_json() or {}

    params = data.get("parameters")
    source_type = data.get("source_type", "White_LED")
    add_emission_lines = data.get("add_emission_lines", True)
    seed = data.get("seed")

    try:
        start_time = time.time()
        result = computation.simulate_full_spectrum(
            params=params,
            source_type=source_type,
            add_emission_lines=add_emission_lines,
            seed=seed
        )
        elapsed = time.time() - start_time
        result["computation_time_ms"] = round(elapsed * 1000, 2)
        return jsonify(result)
    except Exception as e:
        logger.error(f"光谱仿真失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/calibrate/wavelength", methods=["POST"])
def calibrate_wavelength():
    """波长标定"""
    data = request.get_json() or {}
    reference_lines = data.get("reference_lines")

    try:
        result = computation.run_wavelength_calibration(reference_lines)
        return jsonify(result)
    except Exception as e:
        logger.error(f"波长标定失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/calibrate/intensity", methods=["POST"])
def calibrate_intensity():
    """强度标定"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "请求数据为空"}), 400

    measured = data.get("measured_intensities", [])
    reference = data.get("reference_intensities", [])
    wavelengths = data.get("wavelengths")

    try:
        result = computation.run_intensity_calibration(
            measured, reference, wavelengths
        )
        return jsonify(result)
    except Exception as e:
        logger.error(f"强度标定失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/calibrate/full", methods=["POST"])
def calibrate_full():
    """完整标定（波长+强度）"""
    data = request.get_json() or {}
    reference_lines = data.get("reference_lines")

    try:
        result = computation.run_full_calibration(reference_lines)
        return jsonify(result)
    except Exception as e:
        logger.error(f"完整标定失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/calibrated-spectrum", methods=["GET"])
def get_calibrated_spectrum():
    """获取标定后的光谱"""
    try:
        result = computation.get_calibrated_spectrum()
        return jsonify(result)
    except Exception as e:
        logger.error(f"获取标定光谱失败: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/calibration/validate", methods=["POST"])
def validate_calibration():
    """验证标定结果"""
    data = request.get_json() or {}
    test_lines = data.get("test_reference_lines")
    tolerance = data.get("tolerance_pct", 2.0)

    try:
        result = computation.validate_calibration(test_lines, tolerance)
        return jsonify(result)
    except Exception as e:
        logger.error(f"标定验证失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/report/generate", methods=["POST"])
def generate_report():
    """生成标定报告"""
    data = request.get_json() or {}

    try:
        calibration_result = data.get("calibration_results", {})
        spectrum_data = data.get("spectrum_data", {})
        parameters = data.get("parameters", {})
        metrics = data.get("metrics")
        format_type = data.get("format", "json")

        report_data = report_service.generate_report_data(
            calibration_result, spectrum_data, parameters, metrics
        )

        if format_type == "html":
            filepath = report_service.export_html_report(report_data)
        else:
            filepath = report_service.export_json_report(report_data)

        preview = report_service.get_report_preview(report_data)

        return jsonify({
            "status": "success",
            "report_data": report_data,
            "preview": preview,
            "filepath": filepath,
            "format": format_type
        })
    except Exception as e:
        logger.error(f"报告生成失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/report/export", methods=["POST"])
def export_report():
    """导出报告到指定格式"""
    data = request.get_json() or {}

    try:
        report_data = data.get("report_data")
        format_type = data.get("format", "json")
        filename = data.get("filename")

        if not report_data:
            return jsonify({"error": "报告数据为空"}), 400

        if format_type == "html":
            filepath = report_service.export_html_report(report_data, filename)
        else:
            filepath = report_service.export_json_report(report_data, filename)

        return jsonify({
            "status": "success",
            "filepath": filepath,
            "format": format_type
        })
    except Exception as e:
        logger.error(f"报告导出失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/report/preview", methods=["POST"])
def preview_report():
    """获取报告预览"""
    data = request.get_json() or {}

    try:
        calibration_result = data.get("calibration_results", {})
        spectrum_data = data.get("spectrum_data", {})
        parameters = data.get("parameters", {})
        metrics = data.get("metrics")

        report_data = report_service.generate_report_data(
            calibration_result, spectrum_data, parameters, metrics
        )
        preview = report_service.get_report_preview(report_data)

        return jsonify({
            "status": "success",
            "preview": preview
        })
    except Exception as e:
        logger.error(f"报告预览失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/reset", methods=["POST"])
def reset_service():
    """重置服务状态"""
    computation.reset()
    return jsonify({"status": "success", "message": "服务已重置"})


@app.route("/api/pipeline/full", methods=["POST"])
def run_full_pipeline():
    """
    运行完整流程:
    1. 加载参数
    2. 光谱仿真
    3. 标定
    4. 生成报告
    """
    data = request.get_json() or {}
    params = data.get("parameters")
    source_type = data.get("source_type", "White_LED")
    seed = data.get("seed")
    reference_lines = data.get("reference_lines")

    try:
        total_start = time.time()

        if params:
            computation.load_parameters(data=params)

        sim_result = computation.simulate_full_spectrum(
            source_type=source_type,
            add_emission_lines=True,
            seed=seed
        )

        cal_result = computation.run_full_calibration(reference_lines)

        calibrated_spectrum = computation.get_calibrated_spectrum()

        cal_results_for_report = {
            "wavelength_calibration": cal_result.get("wavelength_calibration", {}),
            "intensity_calibration": cal_result.get("intensity_calibration", {})
        }

        report_data = report_service.generate_report_data(
            cal_results_for_report,
            sim_result,
            computation.parser.parse_all(),
            cal_result.get("metrics")
        )

        report_path = report_service.export_json_report(report_data)

        total_elapsed = time.time() - total_start

        return jsonify({
            "status": "success",
            "simulation": sim_result,
            "calibration": cal_result,
            "calibrated_spectrum": calibrated_spectrum,
            "report": {
                "data": report_data,
                "preview": report_service.get_report_preview(report_data),
                "filepath": report_path
            },
            "total_time_ms": round(total_elapsed * 1000, 2),
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"完整流程执行失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/scenarios", methods=["GET"])
def list_scenarios():
    """列出所有标定方案"""
    tag_filter = request.args.get("tag")
    status_filter = request.args.get("status")
    try:
        scenarios = batch_service.list_scenarios(tag_filter, status_filter)
        return jsonify({
            "status": "success",
            "scenarios": [s.to_dict() for s in scenarios]
        })
    except Exception as e:
        logger.error(f"获取方案列表失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/scenarios", methods=["POST"])
def create_scenario():
    """创建新标定方案"""
    data = request.get_json() or {}
    try:
        name = data.get("name", "未命名方案")
        parameters = data.get("parameters", {})
        description = data.get("description", "")
        reference_lines = data.get("reference_lines", [])
        tags = data.get("tags", [])

        scenario = batch_service.create_scenario(
            name=name,
            parameters=parameters,
            description=description,
            reference_lines=reference_lines,
            tags=tags
        )
        return jsonify({
            "status": "success",
            "scenario": scenario.to_dict()
        })
    except ValueError as e:
        return jsonify({"error": str(e), "status": "error"}), 400
    except Exception as e:
        logger.error(f"创建方案失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/scenarios/<scenario_id>", methods=["GET"])
def get_scenario(scenario_id):
    """获取单个方案详情"""
    try:
        scenario = batch_service.get_scenario(scenario_id)
        if not scenario:
            return jsonify({"error": "方案不存在", "status": "error"}), 404
        return jsonify({
            "status": "success",
            "scenario": scenario.to_dict()
        })
    except Exception as e:
        logger.error(f"获取方案失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/scenarios/<scenario_id>", methods=["PUT"])
def update_scenario(scenario_id):
    """更新方案"""
    data = request.get_json() or {}
    try:
        scenario = batch_service.update_scenario(
            scenario_id=scenario_id,
            name=data.get("name"),
            description=data.get("description"),
            parameters=data.get("parameters"),
            reference_lines=data.get("reference_lines"),
            tags=data.get("tags")
        )
        if not scenario:
            return jsonify({"error": "方案不存在", "status": "error"}), 404
        return jsonify({
            "status": "success",
            "scenario": scenario.to_dict()
        })
    except Exception as e:
        logger.error(f"更新方案失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/scenarios/<scenario_id>", methods=["DELETE"])
def delete_scenario(scenario_id):
    """删除方案"""
    try:
        success = batch_service.delete_scenario(scenario_id)
        if not success:
            return jsonify({"error": "方案不存在", "status": "error"}), 404
        return jsonify({"status": "success", "message": "方案已删除"})
    except Exception as e:
        logger.error(f"删除方案失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/scenarios/<scenario_id>/duplicate", methods=["POST"])
def duplicate_scenario(scenario_id):
    """复制方案"""
    data = request.get_json() or {}
    try:
        new_name = data.get("new_name", "方案副本")
        scenario = batch_service.duplicate_scenario(scenario_id, new_name)
        if not scenario:
            return jsonify({"error": "方案不存在", "status": "error"}), 404
        return jsonify({
            "status": "success",
            "scenario": scenario.to_dict()
        })
    except Exception as e:
        logger.error(f"复制方案失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/scenarios/<scenario_id>/run", methods=["POST"])
def run_scenario(scenario_id):
    """执行单个方案"""
    try:
        result = batch_service.run_scenario(scenario_id)
        return jsonify(result)
    except Exception as e:
        logger.error(f"执行方案失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/scenarios/batch/run", methods=["POST"])
def run_batch_scenarios():
    """批量执行方案"""
    data = request.get_json() or {}
    try:
        scenario_ids = data.get("scenario_ids", [])
        stop_on_error = data.get("stop_on_error", False)
        result = batch_service.run_batch(scenario_ids, stop_on_error)
        return jsonify({
            "status": "success",
            "result": result
        })
    except Exception as e:
        logger.error(f"批量执行失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/scenarios/compare", methods=["POST"])
def compare_scenarios():
    """比对多个方案结果"""
    data = request.get_json() or {}
    try:
        scenario_ids = data.get("scenario_ids", [])
        metric_names = data.get("metric_names")
        result = batch_service.compare_scenarios(scenario_ids, metric_names)
        return jsonify(result)
    except Exception as e:
        logger.error(f"方案比对失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/scenarios/<scenario_id>/clear-result", methods=["POST"])
def clear_scenario_result(scenario_id):
    """清除方案结果"""
    try:
        count = batch_service.clear_results([scenario_id])
        return jsonify({
            "status": "success",
            "cleared_count": count
        })
    except Exception as e:
        logger.error(f"清除结果失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/recording/status", methods=["GET"])
def get_recording_status():
    """获取录制状态"""
    try:
        status = recording_service.get_recording_status()
        return jsonify(status)
    except Exception as e:
        logger.error(f"获取录制状态失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/recording/start", methods=["POST"])
def start_recording():
    """开始录制"""
    data = request.get_json() or {}
    try:
        name = data.get("name", f"录制_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        description = data.get("description", "")
        fps = data.get("fps", 30)
        initial_parameters = data.get("initial_parameters", {})

        result = recording_service.start_recording(
            name=name,
            description=description,
            fps=fps,
            initial_parameters=initial_parameters
        )
        return jsonify(result)
    except Exception as e:
        logger.error(f"开始录制失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/recording/stop", methods=["POST"])
def stop_recording():
    """停止录制"""
    try:
        result = recording_service.stop_recording()
        return jsonify(result)
    except Exception as e:
        logger.error(f"停止录制失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/recording/pause", methods=["POST"])
def pause_recording():
    """暂停录制"""
    try:
        result = recording_service.pause_recording()
        return jsonify(result)
    except Exception as e:
        logger.error(f"暂停录制失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/recording/resume", methods=["POST"])
def resume_recording():
    """恢复录制"""
    try:
        result = recording_service.resume_recording()
        return jsonify(result)
    except Exception as e:
        logger.error(f"恢复录制失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/recording/frame", methods=["POST"])
def record_frame():
    """录制单帧"""
    data = request.get_json() or {}
    try:
        wavelength = data.get("wavelength", [])
        intensity = data.get("intensity", [])
        optical_path_state = data.get("optical_path_state", {})
        parameter_snapshot = data.get("parameter_snapshot", {})
        metrics = data.get("metrics", {})

        result = recording_service.record_frame(
            wavelength=np.array(wavelength),
            intensity=np.array(intensity),
            optical_path_state=optical_path_state,
            parameter_snapshot=parameter_snapshot,
            metrics=metrics
        )
        return jsonify(result)
    except Exception as e:
        logger.error(f"录制帧失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/recordings", methods=["GET"])
def list_recordings():
    """列出所有录制"""
    try:
        recordings = recording_service.list_recordings()
        return jsonify({
            "status": "success",
            "recordings": recordings
        })
    except Exception as e:
        logger.error(f"获取录制列表失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/recordings/<recording_id>", methods=["GET"])
def get_recording(recording_id):
    """获取录制详情"""
    try:
        recording = recording_service.get_recording(recording_id)
        if not recording:
            return jsonify({"error": "录制不存在", "status": "error"}), 404
        return jsonify({
            "status": "success",
            "recording": recording
        })
    except Exception as e:
        logger.error(f"获取录制失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/recordings/<recording_id>/frames", methods=["GET"])
def get_recording_frames(recording_id):
    """获取录制的帧数据"""
    try:
        start_frame = int(request.args.get("start", 0))
        end_frame = request.args.get("end")
        if end_frame:
            end_frame = int(end_frame)
        stride = int(request.args.get("stride", 1))

        frames = recording_service.get_frame_range(
            recording_id, start_frame, end_frame, stride
        )
        return jsonify({
            "status": "success",
            "frames": frames,
            "count": len(frames)
        })
    except Exception as e:
        logger.error(f"获取帧数据失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/recordings/<recording_id>/playback", methods=["GET"])
def get_playback_data(recording_id):
    """获取回放配置"""
    try:
        speed = float(request.args.get("speed", 1.0))
        result = recording_service.generate_playback_data(recording_id, speed)
        return jsonify(result)
    except Exception as e:
        logger.error(f"获取回放数据失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/recordings/<recording_id>/stats", methods=["GET"])
def get_recording_stats(recording_id):
    """获取录制统计"""
    try:
        stats = recording_service.get_summary_statistics(recording_id)
        return jsonify(stats)
    except Exception as e:
        logger.error(f"获取录制统计失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/recordings/<recording_id>/diff", methods=["POST"])
def compute_frame_diff(recording_id):
    """计算帧差异"""
    data = request.get_json() or {}
    try:
        frame1 = data.get("frame1_index", 0)
        frame2 = data.get("frame2_index", 1)
        result = recording_service.compute_frame_difference(recording_id, frame1, frame2)
        return jsonify(result)
    except Exception as e:
        logger.error(f"计算帧差异失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route("/api/recordings/<recording_id>", methods=["DELETE"])
def delete_recording(recording_id):
    """删除录制"""
    try:
        success = recording_service.delete_recording(recording_id)
        if not success:
            return jsonify({"error": "录制不存在", "status": "error"}), 404
        return jsonify({"status": "success", "message": "录制已删除"})
    except Exception as e:
        logger.error(f"删除录制失败: {e}")
        return jsonify({"error": str(e), "status": "error"}), 500


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "接口不存在", "status": "error"}), 404


@app.errorhandler(500)
def internal_error(e):
    return jsonify({"error": "服务器内部错误", "status": "error"}), 500


def create_app():
    """创建 Flask 应用"""
    return app


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="光谱分析仪标定仿真后端服务")
    parser.add_argument("--host", default="127.0.0.1", help="服务地址")
    parser.add_argument("--port", type=int, default=5000, help="服务端口")
    parser.add_argument("--debug", action="store_true", help="调试模式")

    args = parser.parse_args()

    logger.info(f"启动光谱分析仪标定仿真后端服务: {args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)
