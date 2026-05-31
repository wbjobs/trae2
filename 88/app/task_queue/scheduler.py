from loguru import logger
from app.task_queue.celery_app import celery_app


def submit_batch_task(task_id: str, extra_params: dict | None = None) -> str:
    result = celery_app.send_task(
        "app.task_queue.tasks.process_batch_coordinator_task",
        args=[task_id, extra_params],
        queue="coordinator",
    )
    logger.info(f"Submitted batch coordinator task: {task_id}, celery_id: {result.id}")
    return result.id


def submit_dead_letter_retry(task_id: str) -> str:
    result = celery_app.send_task(
        "app.task_queue.tasks.retry_dead_letter_task",
        args=[task_id],
        queue="dead_letter_retry",
    )
    logger.info(f"Submitted dead letter retry for task: {task_id}, celery_id: {result.id}")
    return result.id


def get_task_status(celery_task_id: str) -> dict:
    result = celery_app.AsyncResult(celery_task_id)
    if result.state == "PENDING":
        return {"state": "PENDING", "progress": 0}
    elif result.state == "PROGRESS":
        return {"state": "PROGRESS", "progress": result.info.get("progress", 0), "meta": result.info}
    elif result.state == "SUCCESS":
        return {"state": "SUCCESS", "progress": 100, "result": result.result}
    elif result.state == "FAILURE":
        return {"state": "FAILURE", "error": str(result.result)}
    elif result.state == "RETRY":
        return {"state": "RETRY", "progress": 0}
    elif result.state == "REVOKED":
        return {"state": "REVOKED", "progress": 0}
    else:
        return {"state": result.state}


def revoke_task(celery_task_id: str):
    celery_app.control.revoke(celery_task_id, terminate=True, signal="SIGTERM")
    logger.info(f"Revoked celery task: {celery_task_id}")
