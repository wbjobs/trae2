import json
import logging
from typing import Dict, List, Optional
from celery.result import AsyncResult
from .celery_config import celery_app
from .tasks import (
    preprocess_data_task,
    compute_seepage_steady_task,
    compute_seepage_transient_task,
    compute_water_level_task,
    long_term_projection_task,
)
from .smart_scheduler import SmartScheduler

logger = logging.getLogger(__name__)


class TaskScheduler:

    def __init__(self):
        self._smart_scheduler = SmartScheduler()

    def submit_preprocess(self, data_json: str, pipeline_config: dict) -> str:
        result = preprocess_data_task.delay(data_json, pipeline_config)
        logger.info(f"Submitted preprocessing task: {result.id}")
        return result.id

    def submit_seepage_steady(self, params: dict) -> str:
        params_json = json.dumps(params, default=str)
        queue = self._smart_scheduler.get_optimal_queue(
            "task_scheduler.tasks.compute_seepage_steady_task"
        )
        result = compute_seepage_steady_task.apply_async(
            args=[params_json], queue=queue
        )
        logger.info(f"Submitted seepage steady task: {result.id}, queue: {queue}")
        return result.id

    def submit_seepage_transient(self, params: dict) -> str:
        params_json = json.dumps(params, default=str)
        queue = self._smart_scheduler.get_optimal_queue(
            "task_scheduler.tasks.compute_seepage_transient_task"
        )
        result = compute_seepage_transient_task.apply_async(
            args=[params_json], queue=queue
        )
        logger.info(f"Submitted seepage transient task: {result.id}, queue: {queue}")
        return result.id

    def submit_water_level(self, params: dict) -> str:
        params_json = json.dumps(params, default=str)
        queue = self._smart_scheduler.get_optimal_queue(
            "task_scheduler.tasks.compute_water_level_task"
        )
        result = compute_water_level_task.apply_async(
            args=[params_json], queue=queue
        )
        logger.info(f"Submitted water level evolution task: {result.id}, queue: {queue}")
        return result.id

    def submit_long_term_projection(self, params: dict) -> str:
        params_json = json.dumps(params, default=str)
        queue = self._smart_scheduler.get_optimal_queue(
            "task_scheduler.tasks.long_term_projection_task"
        )
        result = long_term_projection_task.apply_async(
            args=[params_json], queue=queue
        )
        logger.info(f"Submitted long term projection task: {result.id}, queue: {queue}")
        return result.id

    def submit_with_checkpoint(self, params: dict, task_type: str = "water_level", checkpoint_task_id: Optional[str] = None) -> str:
        params["checkpoint_task_id"] = checkpoint_task_id or params.get("checkpoint_task_id", "")
        params["resume"] = True

        if task_type == "water_level":
            return self.submit_water_level(params)
        elif task_type == "seepage_steady":
            return self.submit_seepage_steady(params)
        elif task_type == "seepage_transient":
            return self.submit_seepage_transient(params)
        elif task_type == "long_term":
            return self.submit_long_term_projection(params)
        else:
            raise ValueError(f"Unknown task type: {task_type}")

    def submit_scenario_comparison(self, scenarios: List[Dict]) -> Dict:
        task_ids = {}
        for scenario in scenarios:
            name = scenario.get("name", f"scenario-{len(task_ids)}")
            params = scenario.get("params", {})
            task_type = scenario.get("task_type", "water_level")

            if task_type == "water_level":
                task_id = self.submit_water_level(params)
            elif task_type == "seepage_steady":
                task_id = self.submit_seepage_steady(params)
            elif task_type == "long_term":
                task_id = self.submit_long_term_projection(params)
            else:
                task_id = self.submit_water_level(params)

            task_ids[name] = task_id
            logger.info(f"Scenario '{name}' submitted as task {task_id}")

        return {
            "scenario_count": len(scenarios),
            "task_ids": task_ids,
        }

    @staticmethod
    def get_task_status(task_id: str) -> Dict:
        result = AsyncResult(task_id, app=celery_app)
        response = {
            "task_id": task_id,
            "status": result.status,
        }
        if result.ready():
            if result.successful():
                response["result"] = result.result
            else:
                response["error"] = str(result.result)
        elif result.state == "COMPUTING" or result.state == "PROCESSING":
            response["meta"] = result.info
        return response

    @staticmethod
    def cancel_task(task_id: str) -> bool:
        result = AsyncResult(task_id, app=celery_app)
        result.revoke(terminate=True)
        logger.info(f"Revoked task: {task_id}")
        return True

    @staticmethod
    def get_active_tasks() -> List[Dict]:
        inspector = celery_app.control.inspect()
        active = inspector.active() or {}
        tasks = []
        for worker, worker_tasks in active.items():
            for t in worker_tasks:
                tasks.append({
                    "task_id": t["id"],
                    "name": t["name"],
                    "worker": worker,
                    "args": t.get("args", ""),
                })
        return tasks

    @staticmethod
    def get_worker_status() -> Dict:
        inspector = celery_app.control.inspect()
        stats = inspector.stats() or {}
        active = inspector.active() or {}
        reserved = inspector.reserved() or {}

        workers = {}
        for worker_name in stats:
            workers[worker_name] = {
                "stats": stats.get(worker_name, {}),
                "active_tasks": len(active.get(worker_name, [])),
                "reserved_tasks": len(reserved.get(worker_name, [])),
            }
        return workers

    def get_cluster_utilization(self) -> Dict:
        return self._smart_scheduler.get_cluster_utilization()

    def get_redistribution_suggestions(self) -> List[Dict]:
        return self._smart_scheduler.suggest_task_redistribution()

    def estimate_completion(self, task_name: str) -> Optional[float]:
        return self._smart_scheduler.estimate_completion_time(task_name)

    def batch_submit_seepage(self, params_list: List[dict]) -> List[str]:
        task_ids = []
        for params in params_list:
            task_id = self.submit_seepage_steady(params)
            task_ids.append(task_id)
        logger.info(f"Batch submitted {len(task_ids)} seepage tasks")
        return task_ids

    def batch_submit_water_level(self, params_list: List[dict]) -> List[str]:
        task_ids = []
        for params in params_list:
            task_id = self.submit_water_level(params)
            task_ids.append(task_id)
        logger.info(f"Batch submitted {len(task_ids)} water level tasks")
        return task_ids

    def smart_batch_submit(self, tasks: List[Dict]) -> List[Dict]:
        assignments = self._smart_scheduler.schedule_batch(tasks)
        submitted = []
        for assignment in assignments:
            task_type = assignment.get("task_type", "water_level")
            params = assignment.get("params", {})
            queue = assignment.get("queue", "default")
            params_json = json.dumps(params, default=str)

            if task_type == "water_level":
                result = compute_water_level_task.apply_async(args=[params_json], queue=queue)
            elif task_type == "seepage_steady":
                result = compute_seepage_steady_task.apply_async(args=[params_json], queue=queue)
            elif task_type == "long_term":
                result = long_term_projection_task.apply_async(args=[params_json], queue=queue)
            else:
                result = compute_water_level_task.apply_async(args=[params_json], queue=queue)

            submitted.append({
                "task_id": result.id,
                "assigned_worker": assignment.get("assigned_worker"),
                "queue": queue,
            })

        logger.info(f"Smart batch submitted {len(submitted)} tasks")
        return submitted
