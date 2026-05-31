import os
import sys
import logging
from logging.handlers import RotatingFileHandler

from flask import Flask, request, jsonify
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import LOG_DIR, LOG_LEVEL
from task_scheduler.scheduler import TaskScheduler
from monitoring.cluster_monitor import ClusterMonitor

os.makedirs(LOG_DIR, exist_ok=True)

logger = logging.getLogger("gw_sim")
logger.setLevel(getattr(logging, LOG_LEVEL.upper()))
handler = RotatingFileHandler(
    os.path.join(LOG_DIR, "gw_sim.log"), maxBytes=10*1024*1024, backupCount=5
)
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)

app = Flask(__name__)
CORS(app)

scheduler = TaskScheduler()
cluster_monitor = ClusterMonitor()
cluster_monitor.start_collection()


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "service": "gw-sim"})


@app.route("/api/cluster/status", methods=["GET"])
def cluster_status():
    status = cluster_monitor.get_cluster_status()
    return jsonify(status)


@app.route("/api/cluster/tasks", methods=["GET"])
def cluster_tasks():
    limit = request.args.get("limit", 50, type=int)
    tasks = cluster_monitor.get_all_task_history(limit=limit)
    return jsonify({"tasks": tasks, "count": len(tasks)})


@app.route("/api/workers", methods=["GET"])
def workers_status():
    status = scheduler.get_worker_status()
    return jsonify(status)


@app.route("/api/tasks/active", methods=["GET"])
def active_tasks():
    tasks = scheduler.get_active_tasks()
    return jsonify({"tasks": tasks, "count": len(tasks)})


@app.route("/api/task/preprocess", methods=["POST"])
def submit_preprocess():
    data = request.get_json()
    if not data or "data_json" not in data:
        return jsonify({"error": "Missing data_json"}), 400

    data_json = data["data_json"]
    pipeline_config = data.get("pipeline_config", {})
    task_id = scheduler.submit_preprocess(data_json, pipeline_config)
    return jsonify({"task_id": task_id, "status": "submitted"})


@app.route("/api/task/seepage/steady", methods=["POST"])
def submit_seepage_steady():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Empty request"}), 400
    task_id = scheduler.submit_seepage_steady(data)
    return jsonify({"task_id": task_id, "status": "submitted"})


@app.route("/api/task/seepage/transient", methods=["POST"])
def submit_seepage_transient():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Empty request"}), 400
    task_id = scheduler.submit_seepage_transient(data)
    return jsonify({"task_id": task_id, "status": "submitted"})


@app.route("/api/task/water-level", methods=["POST"])
def submit_water_level():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Empty request"}), 400
    task_id = scheduler.submit_water_level(data)
    return jsonify({"task_id": task_id, "status": "submitted"})


@app.route("/api/task/long-term", methods=["POST"])
def submit_long_term():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Empty request"}), 400
    task_id = scheduler.submit_long_term_projection(data)
    return jsonify({"task_id": task_id, "status": "submitted"})


@app.route("/api/task/status/<task_id>", methods=["GET"])
def task_status(task_id):
    status = scheduler.get_task_status(task_id)
    return jsonify(status)


@app.route("/api/task/cancel/<task_id>", methods=["POST"])
def cancel_task(task_id):
    success = scheduler.cancel_task(task_id)
    return jsonify({"task_id": task_id, "cancelled": success})


@app.route("/api/batch/seepage", methods=["POST"])
def batch_seepage():
    data = request.get_json()
    if not data or "params_list" not in data:
        return jsonify({"error": "Missing params_list"}), 400

    params_list = data["params_list"]
    task_ids = scheduler.batch_submit_seepage(params_list)
    return jsonify({"task_ids": task_ids, "count": len(task_ids)})


@app.route("/api/batch/water-level", methods=["POST"])
def batch_water_level():
    data = request.get_json()
    if not data or "params_list" not in data:
        return jsonify({"error": "Missing params_list"}), 400

    params_list = data["params_list"]
    task_ids = scheduler.batch_submit_water_level(params_list)
    return jsonify({"task_ids": task_ids, "count": len(task_ids)})


@app.route("/api/task/resume", methods=["POST"])
def resume_task():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Empty request"}), 400
    params = data.get("params", {})
    task_type = data.get("task_type", "water_level")
    checkpoint_task_id = data.get("checkpoint_task_id")
    task_id = scheduler.submit_with_checkpoint(params, task_type, checkpoint_task_id)
    return jsonify({"task_id": task_id, "status": "resumed", "checkpoint": checkpoint_task_id})


@app.route("/api/scenario/compare", methods=["POST"])
def scenario_compare():
    data = request.get_json()
    if not data or "scenarios" not in data:
        return jsonify({"error": "Missing scenarios"}), 400
    result = scheduler.submit_scenario_comparison(data["scenarios"])
    return jsonify(result)


@app.route("/api/smart-batch", methods=["POST"])
def smart_batch():
    data = request.get_json()
    if not data or "tasks" not in data:
        return jsonify({"error": "Missing tasks"}), 400
    submitted = scheduler.smart_batch_submit(data["tasks"])
    return jsonify({"submitted": submitted, "count": len(submitted)})


@app.route("/api/cluster/utilization", methods=["GET"])
def cluster_utilization():
    return jsonify(scheduler.get_cluster_utilization())


@app.route("/api/cluster/redistribution", methods=["GET"])
def redistribution_suggestions():
    suggestions = scheduler.get_redistribution_suggestions()
    return jsonify({"suggestions": suggestions})


@app.route("/api/report/generate", methods=["POST"])
def generate_report():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Empty request"}), 400

    from visualization.report_generator import HydrologyReportGenerator
    import os

    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reports")
    os.makedirs(output_dir, exist_ok=True)

    report_type = data.get("report_type", "simulation")
    simulation_result = data.get("result", {})
    task_id = data.get("task_id", "unknown")
    title = data.get("title", "Groundwater Hydrology Report")

    generator = HydrologyReportGenerator()
    output_path = os.path.join(output_dir, f"{task_id}_report.xlsx")

    try:
        if report_type == "comparison":
            generator.generate_comparison_report(simulation_result, output_path, title)
        elif report_type == "long_term":
            generator.generate_long_term_report(simulation_result, output_path, title=int(data.get("years", 10)), report_title=title)
        else:
            generator.generate_simulation_report(simulation_result, output_path, title)

        return jsonify({"status": "generated", "path": output_path})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    logger.info("Starting GW-Sim API server")
    default_node = cluster_monitor.register_node("main-server")
    default_node.start_heartbeat()
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
