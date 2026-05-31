import numpy as np
import json
import logging
import time
from celery import Task
from .celery_config import celery_app

logger = logging.getLogger(__name__)


def _numpy_to_list(obj):
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, dict):
        return {k: _numpy_to_list(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_numpy_to_list(v) for v in obj]
    return obj


class LoggingTask(Task):
    def on_success(self, retval, task_id, args, kwargs):
        logger.info(f"Task {task_id} completed successfully")

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error(f"Task {task_id} failed: {exc}")

    def on_retry(self, exc, task_id, args, kwargs, einfo):
        logger.warning(f"Task {task_id} retrying: {exc}")


@celery_app.task(bind=True, base=LoggingTask, name="task_scheduler.tasks.preprocess_data_task")
def preprocess_data_task(self, data_json: str, pipeline_config: dict) -> dict:
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from data_preprocessing.pipeline import PreprocessingPipeline
    import pandas as pd

    self.update_state(state="PROCESSING", meta={"step": "loading_data"})

    df = pd.read_json(data_json, orient="records")

    pipeline = PreprocessingPipeline(
        missing_strategy=pipeline_config.get("missing_strategy", "interpolate"),
        outlier_method=pipeline_config.get("outlier_method", "iqr"),
        outlier_action=pipeline_config.get("outlier_action", "clip"),
        normalization_method=pipeline_config.get("normalization_method", "minmax"),
        normalization_columns=pipeline_config.get("normalization_columns"),
    )

    self.update_state(state="PROCESSING", meta={"step": "fit_transform"})
    result_df = pipeline.fit_transform(df)

    self.update_state(state="PROCESSING", meta={"step": "serializing"})
    return {
        "data": result_df.to_json(orient="records"),
        "pipeline_info": pipeline.get_pipeline_info(),
    }


@celery_app.task(bind=True, base=LoggingTask, name="task_scheduler.tasks.compute_seepage_steady_task")
def compute_seepage_steady_task(self, params_json: str) -> dict:
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from seepage_calculation.engine import ComputationEngine

    params = json.loads(params_json)
    self.update_state(state="COMPUTING", meta={"step": "seepage_steady_init"})

    engine = ComputationEngine(use_matlab=params.get("use_matlab", False))
    try:
        result = engine.compute_seepage_steady(params)
        return _numpy_to_list(result)
    finally:
        engine.shutdown()


@celery_app.task(bind=True, base=LoggingTask, name="task_scheduler.tasks.compute_seepage_transient_task")
def compute_seepage_transient_task(self, params_json: str) -> dict:
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from seepage_calculation.engine import ComputationEngine

    params = json.loads(params_json)
    self.update_state(state="COMPUTING", meta={"step": "seepage_transient_init"})

    engine = ComputationEngine(use_matlab=params.get("use_matlab", False))
    try:
        result = engine.compute_seepage_transient(params)
        return _numpy_to_list(result)
    finally:
        engine.shutdown()


@celery_app.task(bind=True, base=LoggingTask, name="task_scheduler.tasks.compute_water_level_task")
def compute_water_level_task(self, params_json: str) -> dict:
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from seepage_calculation.engine import ComputationEngine

    params = json.loads(params_json)
    self.update_state(state="COMPUTING", meta={"step": "water_level_evolution"})

    engine = ComputationEngine(use_matlab=params.get("use_matlab", False))
    try:
        result = engine.compute_water_level_evolution(params)
        return _numpy_to_list(result)
    finally:
        engine.shutdown()


@celery_app.task(bind=True, base=LoggingTask, name="task_scheduler.tasks.long_term_projection_task")
def long_term_projection_task(self, params_json: str) -> dict:
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from seepage_calculation.engine import ComputationEngine
    from storage.influxdb_client import InfluxDBStorage

    params = json.loads(params_json)
    self.update_state(state="COMPUTING", meta={"step": "long_term_projection"})

    engine = ComputationEngine(use_matlab=params.get("use_matlab", False))
    try:
        result = engine.compute_water_level_evolution(params)

        storage = InfluxDBStorage()
        task_id = self.request.id
        storage.write_simulation_result(
            measurement="long_term_projection",
            tags={"task_id": task_id, "mode": params.get("mode", "long_term")},
            fields={"status": "completed"},
        )

        return _numpy_to_list(result)
    finally:
        engine.shutdown()
