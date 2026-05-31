import os
import asyncio
import uuid
import signal
import sys
from typing import Optional, List, Dict, Any
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect, HTTPException, Depends, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import threading
import time

from config import settings
from schemas import (
    AudioUploadResponse, NoiseReductionConfig, FeatureExtractionConfig,
    ClassificationRequest, ClassificationResult, SampleInfo,
    DeviceCreate, DeviceInfoResponse, BatchProcessingRequest,
    StreamSession, ModelInfo
)
from audio_stream_handler import save_uploaded_file, handle_websocket_audio, stream_manager
from denoiser import process_denoise_task
from feature_extractor import process_feature_extraction_task
from fault_classifier import (
    process_classification_task, train_classifier_task, fault_classifier,
    fine_tune_classifier_task, evaluate_model_task
)
from sample_library import sample_library
from database import get_db
from task_manager import get_task_manager, TaskStatus, init_task_manager, get_thread_pool
from segment_manager import get_segment_manager, SegmentMarker
from pipeline.audio_pipeline import AudioProcessingPipeline


task_manager = None
audio_pipeline = None
segment_manager = None
_task_lock = threading.Lock()
_pipeline_lock = threading.Lock()
_segment_lock = threading.Lock()


def get_tm():
    global task_manager
    with _task_lock:
        if task_manager is None:
            task_manager = init_task_manager()
    return task_manager


def get_audio_pipeline():
    global audio_pipeline
    with _pipeline_lock:
        if audio_pipeline is None:
            audio_pipeline = AudioProcessingPipeline(sample_rate=settings.SAMPLE_RATE)
    return audio_pipeline


def get_sm():
    global segment_manager
    with _segment_lock:
        if segment_manager is None:
            segment_manager = get_segment_manager()
    return segment_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting task manager...")
    try:
        get_tm()
    except Exception as e:
        print(f"Warning: Task manager initialization: {e}")

    try:
        get_audio_pipeline()
        print("Audio pipeline initialized")
    except Exception as e:
        print(f"Warning: Audio pipeline initialization: {e}")

    try:
        get_sm()
        print("Segment manager initialized")
    except Exception as e:
        print(f"Warning: Segment manager initialization: {e}")

    thread_pool = get_thread_pool()

    print("Application started successfully")

    yield

    print("Shutting down...")
    if task_manager:
        task_manager._stop()
    thread_pool.shutdown()
    print("Application shutdown complete")


app = FastAPI(
    title="Industrial Audio Fault Detection Platform",
    description="Industrial abnormal sound audio feature extraction and fault identification AI preprocessing platform",
    version=settings.VERSION,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


async def run_in_thread_pool(func, *args, timeout: float = 300.0, **kwargs):
    loop = asyncio.get_event_loop()
    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: func(*args, **kwargs)),
            timeout=timeout
        )
        return result
    except asyncio.TimeoutError:
        return {"error": "Task timeout"}
    except Exception as e:
        return {"error": str(e)}


async def process_pipeline(sample_id: str, pipeline: List[str]) -> Dict[str, Any]:
    results = {}
    for stage in pipeline:
        try:
            if stage == "denoise":
                result = await run_in_thread_pool(process_denoise_task, sample_id, timeout=120.0)
                results["denoise"] = result
            elif stage == "extract_features":
                result = await run_in_thread_pool(process_feature_extraction_task, sample_id, timeout=180.0)
                results["extract_features"] = result
            elif stage == "classify":
                result = await run_in_thread_pool(process_classification_task, sample_id, timeout=60.0)
                results["classify"] = result
        except Exception as e:
            results[stage] = {"error": str(e)}
    return results


@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.get("/health")
async def health_check():
    tm_stats = {}
    try:
        tm = get_tm()
        tm_stats = tm.get_queue_stats()
    except:
        pass

    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "version": settings.VERSION,
        "active_streams": len(stream_manager.active_streams),
        "max_streams": settings.MAX_CONCURRENT_STREAMS,
        "task_manager": tm_stats
    }


@app.get("/api/tasks/stats")
async def get_task_stats():
    try:
        tm = get_tm()
        return tm.get_queue_stats()
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/tasks/{task_id}")
async def get_task_status(task_id: str):
    try:
        tm = get_tm()
        task = tm.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        return {
            "task_id": task.task_id,
            "task_type": task.task_type,
            "status": task.status.value,
            "result": task.result,
            "error": task.error,
            "created_at": task.created_at,
            "started_at": task.started_at,
            "completed_at": task.completed_at,
            "duration": task.duration
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tasks/denoise/{sample_id}")
async def submit_denoise_task(sample_id: str, config: Optional[NoiseReductionConfig] = None):
    try:
        tm = get_tm()
        config_dict = config.model_dump() if config else None

        def wrapped_task():
            return process_denoise_task(sample_id, config_dict)

        task_id = tm.submit_task(
            "process_denoise_task",
            sample_id,
            config_dict,
            task_type="denoise",
            timeout=120.0,
            max_retries=2
        )

        return {
            "task_id": task_id,
            "sample_id": sample_id,
            "task_type": "denoise",
            "status": "submitted"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tasks/features/{sample_id}")
async def submit_feature_task(sample_id: str, config: Optional[FeatureExtractionConfig] = None):
    try:
        tm = get_tm()
        config_dict = config.model_dump() if config else None

        task_id = tm.submit_task(
            "process_feature_extraction_task",
            sample_id,
            config_dict,
            task_type="feature_extraction",
            timeout=180.0,
            max_retries=2
        )

        return {
            "task_id": task_id,
            "sample_id": sample_id,
            "task_type": "feature_extraction",
            "status": "submitted"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tasks/classify/{sample_id}")
async def submit_classify_task(sample_id: str):
    try:
        tm = get_tm()

        task_id = tm.submit_task(
            "process_classification_task",
            sample_id,
            task_type="classification",
            timeout=60.0,
            max_retries=3
        )

        return {
            "task_id": task_id,
            "sample_id": sample_id,
            "task_type": "classification",
            "status": "submitted"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tasks/pipeline/{sample_id}")
async def submit_pipeline_task(
    sample_id: str,
    stages: List[str] = Query(default=["denoise", "extract_features", "classify"])
):
    valid_stages = {"denoise", "extract_features", "classify"}
    invalid_stages = set(stages) - valid_stages
    if invalid_stages:
        raise HTTPException(status_code=400, detail=f"Invalid stages: {invalid_stages}")

    async def run_pipeline():
        return await process_pipeline(sample_id, stages)

    background_tasks = BackgroundTasks()
    background_tasks.add_task(run_pipeline)

    return {
        "sample_id": sample_id,
        "stages": stages,
        "status": "processing",
        "message": "Pipeline started. Use sample detail endpoint to check results."
    }


@app.get("/api/stats")
async def get_statistics():
    return sample_library.get_statistics()


@app.post("/api/audio/upload/{device_id}", response_model=AudioUploadResponse)
async def upload_audio(device_id: str, file: UploadFile = File(...)):
    return await save_uploaded_file(file, device_id)


@app.post("/api/audio/upload/{device_id}/process")
async def upload_and_process(device_id: str, file: UploadFile = File(...),
                             auto_process: bool = True):
    upload_result = await save_uploaded_file(file, device_id)

    if auto_process and upload_result.status == "success":
        async def process_after_upload():
            await asyncio.sleep(0.5)
            await process_pipeline(upload_result.sample_id, ["denoise", "extract_features", "classify"])

        asyncio.create_task(process_after_upload())

        return {
            **upload_result.model_dump(),
            "auto_process": True,
            "pipeline": ["denoise", "extract_features", "classify"]
        }

    return upload_result.model_dump()


@app.websocket("/ws/audio/{device_id}")
async def websocket_audio_stream(websocket: WebSocket, device_id: str):
    await handle_websocket_audio(websocket, device_id)


@app.get("/api/streams")
async def get_active_streams():
    return {"streams": stream_manager.get_all_streams()}


@app.delete("/api/streams/{stream_id}")
async def stop_stream(stream_id: str):
    success = stream_manager.end_stream(stream_id)
    if not success:
        raise HTTPException(status_code=404, detail="Stream not found")
    return {"message": "Stream stopped", "stream_id": stream_id}


@app.post("/api/process/denoise/{sample_id}")
async def denoise_audio(sample_id: str, config: Optional[NoiseReductionConfig] = None):
    config_dict = config.model_dump() if config else None
    result = await run_in_thread_pool(process_denoise_task, sample_id, config_dict, timeout=120.0)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/api/process/features/{sample_id}")
async def extract_features(sample_id: str, config: Optional[FeatureExtractionConfig] = None):
    config_dict = config.model_dump() if config else None
    result = await run_in_thread_pool(process_feature_extraction_task, sample_id, config_dict, timeout=180.0)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/api/process/classify/{sample_id}", response_model=ClassificationResult)
async def classify_audio(sample_id: str):
    result = await run_in_thread_pool(process_classification_task, sample_id, timeout=60.0)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/api/process/pipeline/{sample_id}")
async def process_pipeline_endpoint(
    sample_id: str,
    stages: List[str] = Query(default=["denoise", "extract_features", "classify"])
):
    valid_stages = {"denoise", "extract_features", "classify"}
    invalid_stages = set(stages) - valid_stages
    if invalid_stages:
        raise HTTPException(status_code=400, detail=f"Invalid stages: {invalid_stages}")

    results = await process_pipeline(sample_id, stages)
    return {
        "sample_id": sample_id,
        "stages": stages,
        "results": results
    }


@app.post("/api/process/batch")
async def batch_process(request: BatchProcessingRequest):
    results = {}
    semaphore = asyncio.Semaphore(4)

    async def process_sample(sample_id):
        async with semaphore:
            return await process_pipeline(sample_id, request.processing_pipeline)

    all_samples = []
    for device_id in request.device_ids:
        samples, _ = sample_library.get_samples(device_id=device_id, limit=10)
        all_samples.extend(samples)

    tasks = [process_sample(sample.sample_id) for sample in all_samples]
    pipeline_results = await asyncio.gather(*tasks, return_exceptions=True)

    for i, sample in enumerate(all_samples):
        result = pipeline_results[i]
        if isinstance(result, Exception):
            results[sample.sample_id] = {"error": str(result)}
        else:
            results[sample.sample_id] = result

    return {
        "total_devices": len(request.device_ids),
        "total_samples": len(results),
        "results": results
    }


@app.get("/api/samples")
async def get_samples(
    device_id: Optional[str] = None,
    fault_type: Optional[str] = None,
    is_labeled: Optional[bool] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 100,
    offset: int = 0
):
    samples, total = sample_library.get_samples(
        device_id, fault_type, is_labeled, start_date, end_date, limit, offset
    )
    return {
        "samples": [
            {
                "sample_id": s.sample_id,
                "device_id": s.device_id,
                "file_name": s.file_name,
                "duration": s.duration,
                "sample_rate": s.sample_rate,
                "fault_type": s.fault_type,
                "fault_severity": s.fault_severity,
                "is_labeled": s.is_labeled,
                "classification_result": s.classification_result,
                "classification_confidence": s.classification_confidence,
                "created_at": s.created_at.isoformat()
            }
            for s in samples
        ],
        "total": total,
        "limit": limit,
        "offset": offset
    }


@app.get("/api/samples/{sample_id}")
async def get_sample_detail(sample_id: str):
    sample = sample_library.get_sample(sample_id)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    features = sample.get_features()
    history = sample_library.get_sample_processing_history(sample_id)

    return {
        "sample_id": sample.sample_id,
        "device_id": sample.device_id,
        "file_name": sample.file_name,
        "file_path": sample.file_path,
        "duration": sample.duration,
        "sample_rate": sample.sample_rate,
        "channels": sample.channels,
        "fault_type": sample.fault_type,
        "fault_severity": sample.fault_severity,
        "is_labeled": sample.is_labeled,
        "classification_result": sample.classification_result,
        "classification_confidence": sample.classification_confidence,
        "noise_level_before": sample.noise_level_before,
        "noise_level_after": sample.noise_level_after,
        "features": features,
        "processing_history": history,
        "created_at": sample.created_at.isoformat()
    }


@app.put("/api/samples/{sample_id}/label")
async def label_sample(sample_id: str, fault_type: str, severity: Optional[str] = None):
    result = sample_library.update_sample_label(sample_id, fault_type, severity)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.delete("/api/samples/{sample_id}")
async def delete_sample(sample_id: str):
    result = sample_library.delete_sample(sample_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.get("/api/samples/{sample_id}/download")
async def download_sample(sample_id: str, denoised: bool = False):
    sample = sample_library.get_sample(sample_id)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    file_path = sample.file_path
    if denoised:
        file_path = sample.file_path.replace('.wav', '_denoised.wav')
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Denoised file not found")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(file_path, filename=os.path.basename(file_path))


@app.post("/api/devices")
async def add_device(device_data: DeviceCreate):
    result = sample_library.add_device(device_data)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.get("/api/devices")
async def get_devices():
    devices = sample_library.get_devices()
    return [
        {
            "device_id": d.device_id,
            "device_name": d.device_name,
            "device_type": d.device_type,
            "location": d.location,
            "status": d.status,
            "description": d.description,
            "created_at": d.created_at.isoformat()
        }
        for d in devices
    ]


@app.delete("/api/devices/{device_id}")
async def delete_device(device_id: str):
    result = sample_library.delete_device(device_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.post("/api/model/train")
async def train_model(sample_ids: Optional[List[str]] = None):
    result = await run_in_thread_pool(train_classifier_task, sample_ids, timeout=600.0)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.get("/api/model/info")
async def get_model_info():
    return fault_classifier.get_model_info()


@app.get("/api/logs")
async def get_processing_logs(
    task_id: Optional[str] = None,
    device_id: Optional[str] = None,
    stage: Optional[str] = None,
    limit: int = 100
):
    logs = sample_library.get_processing_logs(task_id, device_id, stage, limit)
    return [
        {
            "id": log.id,
            "task_id": log.task_id,
            "device_id": log.device_id,
            "stage": log.stage,
            "status": log.status,
            "message": log.message,
            "processing_time": log.processing_time,
            "created_at": log.created_at.isoformat()
        }
        for log in logs
    ]


# ==================== Segment Management API ====================

@app.post("/api/segments/{sample_id}/markers")
async def add_segment_marker(
    sample_id: str,
    start_time: float,
    end_time: float,
    label: Optional[str] = None,
    notes: Optional[str] = None,
    created_by: str = "user"
):
    try:
        sm = get_sm()
        marker = sm.add_marker(sample_id, start_time, end_time, label, notes, created_by)
        if not marker:
            raise HTTPException(status_code=400, detail="Failed to create marker")
        return marker.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/segments/{sample_id}/markers")
async def get_segment_markers(sample_id: str):
    try:
        sm = get_sm()
        markers = sm.get_markers(sample_id)
        return {"markers": [m.to_dict() for m in markers]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/segments/markers/{marker_id}")
async def update_segment_marker(
    marker_id: str,
    label: Optional[str] = None,
    notes: Optional[str] = None,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None
):
    try:
        sm = get_sm()
        update_data = {}
        if label is not None:
            update_data['label'] = label
        if notes is not None:
            update_data['notes'] = notes
        if start_time is not None:
            update_data['start_time'] = start_time
        if end_time is not None:
            update_data['end_time'] = end_time

        marker = sm.update_marker(marker_id, **update_data)
        if not marker:
            raise HTTPException(status_code=404, detail="Marker not found")
        return marker.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/segments/markers/{marker_id}")
async def delete_segment_marker(marker_id: str):
    try:
        sm = get_sm()
        success = sm.delete_marker(marker_id)
        if not success:
            raise HTTPException(status_code=404, detail="Marker not found")
        return {"message": "Marker deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/segments/{sample_id}/auto-detect")
async def auto_detect_segments(
    sample_id: str,
    method: str = "energy",
    threshold: float = 0.1,
    min_segment_duration: float = 0.5,
    max_segment_duration: float = 5.0
):
    try:
        sm = get_sm()
        markers = sm.auto_detect_segments(
            sample_id, method=method,
            threshold=threshold,
            min_segment_duration=min_segment_duration,
            max_segment_duration=max_segment_duration
        )
        return {
            "sample_id": sample_id,
            "method": method,
            "markers_found": len(markers),
            "markers": [m.to_dict() for m in markers]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/segments/{sample_id}/extract")
async def extract_segments_from_markers(sample_id: str):
    try:
        sm = get_sm()
        audio_data = sm.load_sample_audio(sample_id)
        if not audio_data:
            raise HTTPException(status_code=404, detail="Sample audio not found")

        audio, sr = audio_data
        segments = sm.extract_segments_from_markers(audio, sr, sample_id)

        return {
            "sample_id": sample_id,
            "segments_extracted": len(segments),
            "segments": [s.to_dict() for s in segments]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/segments/{sample_id}/export")
async def export_segments(
    sample_id: str,
    output_dir: Optional[str] = None
):
    try:
        sm = get_sm()
        audio_data = sm.load_sample_audio(sample_id)
        if not audio_data:
            raise HTTPException(status_code=404, detail="Sample audio not found")

        audio, sr = audio_data
        segments = sm.extract_segments_from_markers(audio, sr, sample_id)
        result = sm.export_segments(segments, output_dir)

        if not result.success:
            raise HTTPException(status_code=500, detail=result.error)

        return {
            "sample_id": sample_id,
            "output_path": result.output_path,
            "num_segments": result.num_segments,
            "total_duration": result.total_duration
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/segments/stats")
async def get_segment_stats():
    try:
        sm = get_sm()
        return sm.get_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Model Fine-tuning API ====================

@app.post("/api/model/fine-tune")
async def fine_tune_model(
    sample_ids: Optional[List[str]] = None,
    learning_rate: float = 0.1,
    validation_split: float = 0.2
):
    try:
        result = await run_in_thread_pool(
            fine_tune_classifier_task,
            sample_ids,
            learning_rate,
            validation_split,
            timeout=600.0
        )
        if isinstance(result, dict) and "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/model/evaluate")
async def evaluate_model(sample_ids: Optional[List[str]] = None):
    try:
        result = await run_in_thread_pool(
            evaluate_model_task,
            sample_ids,
            timeout=300.0
        )
        if isinstance(result, dict) and "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/model/training-history")
async def get_training_history(limit: int = 20):
    try:
        history = fault_classifier.get_training_history(limit)
        return {"history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Enhanced Task Management API ====================

@app.get("/api/tasks/workers")
async def get_worker_stats():
    try:
        tm = get_tm()
        return {"workers": tm.get_worker_stats()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tasks/batch")
async def submit_batch_tasks(tasks: List[Dict[str, Any]]):
    try:
        tm = get_tm()
        task_ids = tm.submit_task_batch(tasks)
        return {
            "task_ids": task_ids,
            "total_submitted": len(task_ids)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Pipeline Stats API ====================

@app.get("/api/pipeline/stats")
async def get_pipeline_stats():
    try:
        ap = get_audio_pipeline()
        return ap.get_all_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    def signal_handler(signum, frame):
        print(f"Received signal {signum}, shutting down gracefully...")
        if task_manager:
            task_manager._stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    uvicorn.run(app, host=settings.HOST, port=settings.PORT, workers=1)
