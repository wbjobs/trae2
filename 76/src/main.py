import os
import io
import uuid
import json
import asyncio
import logging
import numpy as np
import soundfile as sf
from datetime import datetime
from typing import Optional, List, Dict, Any
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .config import settings
from .database import (
    get_db, init_db, DiagnosisRecord, StreamSession as DBStreamSession,
    FinetuneJob as DBFinetuneJob, AudioMarker as DBAudioMarker, BatchJob as DBBatchJob
)
from .schemas import (
    DiagnosisRequest, DiagnosisResult, AudioUploadResponse, SampleQueryResponse,
    AudioSampleInfo, StreamInitRequest, StreamInitResponse, ModelInfoResponse,
    ProcessingStatus, FaultTypeEnum, MotorTypeEnum, AudioMarkerRequest,
    AudioMarkerResponse, AudioSegmentRequest, AudioSegmentResponse,
    SegmentListResponse, FinetuneRequest, FinetuneResponse,
    FinetuneJobResponse, FinetuneJobListResponse, BatchProcessRequest,
    BatchProcessResponse, BatchStatusResponse, BatchResultResponse,
    SplitAudioRequest, SplitAudioResponse, SchedulerStatusResponse,
    TaskStatusResponse, AddTrainingSampleRequest
)
from .denoiser import AudioDenoiser
from .feature_extractor import FeatureExtractor
from .ai_classifier import AIClassifier
from .sample_library import SampleLibrary
from .storage_service import StorageService
from .audio_stream import AudioStreamManager
from .audio_segmenter import AudioSegmenter
from .model_finetuner import ModelFinetuner
from .concurrency_scheduler import AudioProcessingScheduler, TaskPriority
from .batch_processor import BatchProcessor, LargeAudioSplitter, ParallelStreamProcessor

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="电机运行异响音频诊断AI预处理平台",
    description="支持音频流接收、降噪处理、特征提取、AI故障分类、样本库管理、模型微调、批量处理的完整平台",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

denoiser = AudioDenoiser(sample_rate=settings.sample_rate)
feature_extractor = FeatureExtractor(sample_rate=settings.sample_rate)
classifier = AIClassifier(model_path=settings.model_path)
sample_library = SampleLibrary(storage_path=settings.sample_storage_path)
storage_service = StorageService(
    upload_path=settings.upload_storage_path,
    sample_path=settings.sample_storage_path
)
stream_manager = AudioStreamManager(
    denoiser=denoiser,
    feature_extractor=feature_extractor,
    classifier=classifier,
    storage=storage_service,
    max_streams=settings.max_concurrent_streams
)

audio_segmenter = AudioSegmenter(sample_rate=settings.sample_rate)
model_finetuner = ModelFinetuner(classifier=classifier, feature_extractor=feature_extractor)
scheduler = AudioProcessingScheduler(max_workers=8, max_stream_workers=4)
batch_processor = BatchProcessor(
    denoiser=denoiser,
    feature_extractor=feature_extractor,
    classifier=classifier,
    max_workers=4
)
large_splitter = LargeAudioSplitter(sample_rate=settings.sample_rate)
parallel_processor = ParallelStreamProcessor(
    denoiser=denoiser,
    feature_extractor=feature_extractor,
    classifier=classifier,
    max_streams=settings.max_concurrent_streams
)

processing_executor = ThreadPoolExecutor(max_workers=8)


@app.on_event("startup")
async def startup_event():
    init_db()
    logger.info("Database initialized")
    logger.info(f"AI Model loaded - Type: {classifier.model_info.get('model_type')}, "
                f"Accuracy: {classifier.model_info.get('accuracy'):.4f}")
    
    asyncio.create_task(cleanup_inactive_sessions())
    
    def finetune_callback(job):
        if job.status == "completed" and job.results:
            try:
                db_job = DBFinetuneJob(
                    job_id=job.job_id,
                    status=job.status,
                    description=job.description,
                    num_samples=len(job.samples),
                    config=json.dumps(job.config, ensure_ascii=False),
                    progress=job.progress,
                    train_accuracy=job.results.get("train_accuracy"),
                    validation_accuracy=job.results.get("validation_accuracy"),
                    f1_score=job.results.get("f1_score"),
                    precision=job.results.get("precision"),
                    recall=job.results.get("recall"),
                    model_updated=job.results.get("model_updated", False),
                    results=json.dumps(job.results, ensure_ascii=False),
                    started_at=job.start_time,
                    completed_at=job.end_time
                )
                db = next(get_db())
                db.add(db_job)
                db.commit()
                db.close()
            except Exception as e:
                logger.error(f"Failed to save finetune job: {e}")
    
    model_finetuner.register_callback(finetune_callback)
    logger.info("All modules initialized")


@app.on_event("shutdown")
async def shutdown_event():
    processing_executor.shutdown(wait=True)
    scheduler.shutdown(wait=True)
    model_finetuner.shutdown(wait=True)
    storage_service.close()
    logger.info("Application shutdown complete")


async def cleanup_inactive_sessions():
    while True:
        try:
            closed = stream_manager.cleanup_inactive(timeout_seconds=300)
            if closed > 0:
                logger.info(f"Cleaned up {closed} inactive sessions")
        except Exception as e:
            logger.error(f"Error in cleanup task: {e}")
        await asyncio.sleep(60)


@app.get("/")
async def root():
    return {
        "name": "电机运行异响音频诊断AI预处理平台",
        "version": "2.0.0",
        "status": "running",
        "features": [
            "音频流接收与处理",
            "自适应工业降噪",
            "225维特征提取",
            "AI故障分类",
            "音频片段标记截取",
            "模型在线微调",
            "并发任务调度",
            "批量音频处理",
            "大文件拆分处理"
        ],
        "endpoints": {
            "health_check": "/health",
            "api_docs": "/docs",
            "diagnosis": "/api/v1/diagnosis",
            "samples": "/api/v1/samples",
            "stream": "/api/v1/stream/ws",
            "markers": "/api/v1/markers",
            "segments": "/api/v1/segments",
            "finetune": "/api/v1/finetune",
            "batch": "/api/v1/batch",
            "scheduler": "/api/v1/scheduler/status"
        }
    }


@app.get("/health")
async def health_check():
    scheduler_metrics = scheduler.get_metrics()
    finetune_status = model_finetuner.get_buffer_status()
    stream_load = scheduler.get_stream_load()
    
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.0.0",
        "active_streams": len(stream_manager.sessions),
        "model_loaded": classifier.model is not None,
        "scheduler": scheduler_metrics,
        "finetune_buffer": finetune_status,
        "stream_capacity": stream_load
    }


@app.post("/api/v1/diagnosis", response_model=DiagnosisResult)
async def diagnose_audio(
    file: UploadFile = File(...),
    motor_id: str = Query(...),
    motor_type: MotorTypeEnum = Query(MotorTypeEnum.INDUCTION_MOTOR),
    save_sample: bool = Query(True),
    denoise_method: str = Query("adaptive_industrial"),
    db: Session = Depends(get_db)
):
    start_time = datetime.utcnow()
    
    try:
        file_content = await file.read()
        saved_file = await storage_service.save_uploaded_file(
            file_content,
            file.filename,
            motor_type.value
        )
        
        if saved_file["audio_data"] is None:
            raise HTTPException(status_code=400, detail="无法解析音频文件")
        
        audio_data = saved_file["audio_data"]
        sample_rate = saved_file["sample_rate"] or settings.sample_rate
        
        task_id = scheduler.submit_diagnosis(
            _process_diagnosis_task,
            audio_data, sample_rate, denoise_method, motor_id, motor_type.value,
            save_sample, saved_file, start_time, db
        )
        
        try:
            result = await scheduler.get_result_async(task_id, timeout=30.0)
            return result
        except Exception as e:
            logger.error(f"Diagnosis task failed: {e}")
            raise HTTPException(status_code=500, detail=f"诊断失败: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Diagnosis failed: {e}")
        raise HTTPException(status_code=500, detail=f"诊断失败: {str(e)}")


def _process_diagnosis_task(
    audio_data: np.ndarray,
    sample_rate: int,
    denoise_method: str,
    motor_id: str,
    motor_type: str,
    save_sample: bool,
    saved_file: Dict,
    start_time: datetime,
    db_session
):
    try:
        denoised_audio = denoiser.denoise(audio_data, sample_rate, denoise_method)
        
        denoised_info = storage_service.save_denoised_audio_sync(
            denoised_audio, sample_rate, saved_file["file_id"], motor_type
        )
        
        features = feature_extractor.extract_all_features(denoised_audio, sample_rate)
        
        storage_service.save_features_sync(
            features, saved_file["file_id"], motor_type
        )
        
        prediction, confidence, probabilities = classifier.classify(features)
        
        processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        
        sample_id = None
        if save_sample:
            sample_id = sample_library.add_sample(
                db_session, audio_data, sample_rate, motor_type, prediction,
                None, False, "ai_predicted", features, prediction, confidence
            )
        
        record_id = f"diag_{uuid.uuid4().hex[:16]}"
        record = DiagnosisRecord(
            record_id=record_id,
            sample_id=sample_id,
            motor_id=motor_id,
            motor_type=motor_type,
            fault_type=prediction,
            confidence=confidence,
            features=json.dumps(features, ensure_ascii=False),
            raw_audio_path=saved_file["file_path"],
            denoised_audio_path=denoised_info["file_path"],
            processing_time_ms=processing_time,
            is_realtime=False,
            status="completed"
        )
        db_session.add(record)
        db_session.commit()
        
        storage_service.save_diagnosis_result_sync(
            {
                "record_id": record_id,
                "sample_id": sample_id,
                "motor_id": motor_id,
                "fault_type": prediction,
                "confidence": confidence,
                "fault_probabilities": probabilities,
                "features": features,
                "processing_time_ms": processing_time
            },
            record_id, motor_type
        )
        
        return DiagnosisResult(
            record_id=record_id,
            sample_id=sample_id,
            motor_id=motor_id,
            fault_type=FaultTypeEnum(prediction),
            confidence=confidence,
            fault_probabilities=probabilities,
            features=features,
            processing_time_ms=processing_time,
            is_realtime=False,
            timestamp=datetime.utcnow()
        )
    except Exception as e:
        logger.error(f"Diagnosis task error: {e}")
        raise e


@app.post("/api/v1/markers/add", response_model=AudioMarkerResponse)
async def add_marker(
    request: AudioMarkerRequest,
    db: Session = Depends(get_db)
):
    try:
        marker_id = audio_segmenter.add_marker(
            start_time=request.start_time,
            end_time=request.end_time,
            label=request.label,
            confidence=request.confidence,
            metadata=request.metadata
        )
        
        db_marker = DBAudioMarker(
            marker_id=marker_id,
            sample_id=request.sample_id,
            start_time=request.start_time,
            end_time=request.end_time,
            label=request.label,
            confidence=request.confidence,
            notes=request.notes,
            metadata=json.dumps(request.metadata, ensure_ascii=False) if request.metadata else None
        )
        db.add(db_marker)
        db.commit()
        
        return AudioMarkerResponse(
            marker_id=marker_id,
            sample_id=request.sample_id,
            start_time=request.start_time,
            end_time=request.end_time,
            label=request.label,
            confidence=request.confidence,
            notes=request.notes,
            created_at=datetime.utcnow()
        )
    except Exception as e:
        logger.error(f"Add marker failed: {e}")
        raise HTTPException(status_code=500, detail=f"添加标记失败: {str(e)}")


@app.get("/api/v1/markers")
async def get_markers(
    sample_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    try:
        query = db.query(DBAudioMarker)
        if sample_id:
            query = query.filter(DBAudioMarker.sample_id == sample_id)
        
        markers = query.order_by(DBAudioMarker.start_time).all()
        
        return {
            "total": len(markers),
            "markers": [
                {
                    "marker_id": m.marker_id,
                    "sample_id": m.sample_id,
                    "start_time": m.start_time,
                    "end_time": m.end_time,
                    "label": m.label,
                    "confidence": m.confidence,
                    "notes": m.notes,
                    "created_at": m.created_at.isoformat()
                }
                for m in markers
            ]
        }
    except Exception as e:
        logger.error(f"Get markers failed: {e}")
        raise HTTPException(status_code=500, detail=f"获取标记失败: {str(e)}")


@app.delete("/api/v1/markers/{marker_id}")
async def delete_marker(
    marker_id: str,
    db: Session = Depends(get_db)
):
    try:
        marker = db.query(DBAudioMarker).filter(
            DBAudioMarker.marker_id == marker_id
        ).first()
        
        if not marker:
            raise HTTPException(status_code=404, detail="标记不存在")
        
        db.delete(marker)
        db.commit()
        
        audio_segmenter.remove_marker(marker_id)
        
        return {"success": True, "message": "标记删除成功"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete marker failed: {e}")
        raise HTTPException(status_code=500, detail=f"删除标记失败: {str(e)}")


@app.post("/api/v1/segments/extract", response_model=AudioSegmentResponse)
async def extract_segment(
    request: AudioSegmentRequest,
    db: Session = Depends(get_db)
):
    try:
        sample = sample_library.get_sample(db, request.sample_id)
        if not sample:
            raise HTTPException(status_code=404, detail="样本不存在")
        
        audio_data = sample_library.get_sample_audio(request.sample_id)
        if not audio_data:
            raise HTTPException(status_code=404, detail="音频数据不存在")
        
        audio, sample_rate = audio_data
        
        segment = audio_segmenter.extract_segment(
            audio=audio,
            start_time=request.start_time,
            end_time=request.end_time,
            sample_rate=sample_rate,
            label=request.label
        )
        
        output_dir = os.path.join(settings.sample_storage_path, "segments")
        os.makedirs(output_dir, exist_ok=True)
        segment_path = segment.save(output_dir)
        
        return AudioSegmentResponse(
            segment_id=segment.segment_id,
            sample_id=request.sample_id,
            start_time=segment.start_time,
            end_time=segment.end_time,
            duration=segment.duration,
            label=segment.label,
            download_url=f"/api/v1/segments/{segment.segment_id}/download"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Extract segment failed: {e}")
        raise HTTPException(status_code=500, detail=f"截取片段失败: {str(e)}")


@app.get("/api/v1/segments/{sample_id}/list", response_model=SegmentListResponse)
async def list_segments(
    sample_id: str,
    method: str = Query("fixed", description="segmentation method: fixed, energy, anomaly, beat"),
    segment_duration: float = Query(2.0),
    db: Session = Depends(get_db)
):
    try:
        audio_data = sample_library.get_sample_audio(sample_id)
        if not audio_data:
            raise HTTPException(status_code=404, detail="音频数据不存在")
        
        audio, sample_rate = audio_data
        
        if method == "fixed":
            segments = audio_segmenter.segment_fixed_length(
                audio, sample_rate, segment_duration=segment_duration
            )
        elif method == "energy":
            segments = audio_segmenter.segment_by_energy(audio, sample_rate)
        elif method == "anomaly":
            segments = audio_segmenter.detect_anomaly_segments(audio, sample_rate)
        elif method == "beat":
            segments = audio_segmenter.segment_by_beat(audio, sample_rate)
        elif method == "markers":
            db_markers = db.query(DBAudioMarker).filter(
                DBAudioMarker.sample_id == sample_id
            ).all()
            for m in db_markers:
                audio_segmenter.add_marker(
                    start_time=m.start_time,
                    end_time=m.end_time,
                    label=m.label,
                    confidence=m.confidence
                )
            segments = audio_segmenter.segment_by_markers(audio, sample_rate)
        else:
            raise HTTPException(status_code=400, detail=f"未知的分段方法: {method}")
        
        segment_responses = [
            AudioSegmentResponse(
                segment_id=seg.segment_id,
                sample_id=sample_id,
                start_time=seg.start_time,
                end_time=seg.end_time,
                duration=seg.duration,
                label=seg.label,
                download_url=f"/api/v1/segments/{seg.segment_id}/download"
            )
            for seg in segments
        ]
        
        return SegmentListResponse(
            total=len(segment_responses),
            segments=segment_responses
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"List segments failed: {e}")
        raise HTTPException(status_code=500, detail=f"获取分段列表失败: {str(e)}")


@app.get("/api/v1/segments/{segment_id}/download")
async def download_segment(segment_id: str):
    try:
        segment_dir = os.path.join(settings.sample_storage_path, "segments")
        segment_path = os.path.join(segment_dir, f"{segment_id}.wav")
        
        if not os.path.exists(segment_path):
            raise HTTPException(status_code=404, detail="片段文件不存在")
        
        return FileResponse(
            path=segment_path,
            media_type="audio/wav",
            filename=f"{segment_id}.wav"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Download segment failed: {e}")
        raise HTTPException(status_code=500, detail=f"下载片段失败: {str(e)}")


@app.post("/api/v1/audio/split", response_model=SplitAudioResponse)
async def split_large_audio(
    file: UploadFile = File(...),
    max_segment_duration: float = Query(30.0),
    overlap_duration: float = Query(1.0),
    detect_anomalies: bool = Query(True),
    auto_denoise: bool = Query(True),
    db: Session = Depends(get_db)
):
    try:
        file_content = await file.read()
        audio_file = io.BytesIO(file_content)
        audio, sample_rate = sf.read(audio_file)
        
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        
        total_duration = len(audio) / sample_rate
        
        segments = large_splitter.process_and_split(
            audio=audio,
            sample_rate=sample_rate,
            denoiser=denoiser if auto_denoise else None,
            detect_anomalies=detect_anomalies
        )
        
        segments_data = [
            {
                "segment_id": seg.segment_id,
                "start_time": seg.start_time,
                "end_time": seg.end_time,
                "duration": seg.duration,
                "has_anomaly": seg.metadata.get("has_anomaly", False),
                "label": seg.label
            }
            for seg in segments
        ]
        
        return SplitAudioResponse(
            original_file=file.filename,
            total_duration=total_duration,
            segment_count=len(segments),
            segments=segments_data
        )
    except Exception as e:
        logger.error(f"Split audio failed: {e}")
        raise HTTPException(status_code=500, detail=f"拆分音频失败: {str(e)}")


@app.post("/api/v1/finetune/add-sample")
async def add_training_sample(
    request: AddTrainingSampleRequest,
    db: Session = Depends(get_db)
):
    try:
        features = request.features
        
        if not features and request.sample_id:
            sample = sample_library.get_sample(db, request.sample_id)
            if sample and sample.get("features"):
                features = json.loads(sample["features"])
            else:
                raise HTTPException(status_code=400, detail="无法获取样本特征，请提供features参数")
        
        if not features:
            raise HTTPException(status_code=400, detail="缺少特征数据")
        
        sample_id = model_finetuner.add_training_sample(
            features=features,
            label=request.label,
            sample_id=request.sample_id,
            motor_type=request.motor_type,
            source=request.source,
            confidence=request.confidence
        )
        
        return {
            "success": True,
            "sample_id": sample_id,
            "message": "训练样本已添加",
            "buffer_status": model_finetuner.get_buffer_status()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Add training sample failed: {e}")
        raise HTTPException(status_code=500, detail=f"添加训练样本失败: {str(e)}")


@app.post("/api/v1/finetune/start", response_model=FinetuneResponse)
async def start_finetuning(
    request: FinetuneRequest,
    db: Session = Depends(get_db)
):
    try:
        samples = []
        
        if request.sample_ids:
            for sample_id in request.sample_ids:
                sample = sample_library.get_sample(db, sample_id)
                if not sample or not sample.get("features"):
                    continue
                
                features = json.loads(sample["features"])
                label = request.labels.get(sample_id) if request.labels else sample.get("fault_type")
                
                if not label:
                    continue
                
                from .model_finetuner import TrainingSample
                samples.append(TrainingSample(
                    features=features,
                    label=label,
                    sample_id=sample_id,
                    motor_type=sample.get("motor_type"),
                    source="database",
                    confidence=sample.get("confidence")
                ))
        
        if not samples:
            with model_finetuner._sample_buffer_lock:
                samples = model_finetuner._sample_buffer.copy()
                if not samples:
                    raise HTTPException(status_code=400, detail="没有可用的训练样本")
                model_finetuner._sample_buffer = []
        
        config = {
            "n_estimators": request.n_estimators,
            "max_depth": request.max_depth,
            "validation_split": request.validation_split,
            "min_accuracy": request.min_accuracy,
            "auto_triggered": False
        }
        
        job_id = model_finetuner.start_finetuning_job(
            samples=samples,
            config=config,
            description=request.description or f"Manual finetune with {len(samples)} samples"
        )
        
        db_job = DBFinetuneJob(
            job_id=job_id,
            status="pending",
            description=request.description,
            num_samples=len(samples),
            config=json.dumps(config, ensure_ascii=False),
            progress=0.0
        )
        db.add(db_job)
        db.commit()
        
        return FinetuneResponse(
            job_id=job_id,
            status="pending",
            message=f"微调任务已提交，包含 {len(samples)} 个训练样本"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Start finetuning failed: {e}")
        raise HTTPException(status_code=500, detail=f"启动微调失败: {str(e)}")


@app.get("/api/v1/finetune/jobs/{job_id}", response_model=FinetuneJobResponse)
async def get_finetune_job(job_id: str, db: Session = Depends(get_db)):
    try:
        status = model_finetuner.get_job_status(job_id)
        
        if not status:
            db_job = db.query(DBFinetuneJob).filter(
                DBFinetuneJob.job_id == job_id
            ).first()
            
            if not db_job:
                raise HTTPException(status_code=404, detail="任务不存在")
            
            return FinetuneJobResponse(
                job_id=db_job.job_id,
                status=db_job.status,
                progress=db_job.progress,
                description=db_job.description,
                num_samples=db_job.num_samples,
                train_accuracy=db_job.train_accuracy,
                validation_accuracy=db_job.validation_accuracy,
                f1_score=db_job.f1_score,
                model_updated=db_job.model_updated,
                error_message=db_job.error_message,
                started_at=db_job.started_at,
                completed_at=db_job.completed_at,
                created_at=db_job.created_at
            )
        
        return FinetuneJobResponse(
            job_id=status["job_id"],
            status=status["status"],
            progress=status["progress"],
            description=status.get("description"),
            num_samples=status.get("num_samples", 0),
            train_accuracy=status.get("results", {}).get("train_accuracy") if status.get("results") else None,
            validation_accuracy=status.get("results", {}).get("validation_accuracy") if status.get("results") else None,
            f1_score=status.get("results", {}).get("f1_score") if status.get("results") else None,
            model_updated=status.get("results", {}).get("model_updated", False) if status.get("results") else False,
            error_message=status.get("error"),
            started_at=datetime.fromisoformat(status["start_time"]) if status.get("start_time") else None,
            completed_at=datetime.fromisoformat(status["end_time"]) if status.get("end_time") else None,
            created_at=datetime.fromisoformat(status["created_at"]) if status.get("created_at") else datetime.utcnow()
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get finetune job failed: {e}")
        raise HTTPException(status_code=500, detail=f"获取任务状态失败: {str(e)}")


@app.get("/api/v1/finetune/jobs", response_model=FinetuneJobListResponse)
async def list_finetune_jobs(db: Session = Depends(get_db)):
    try:
        active_jobs = model_finetuner.get_active_jobs()
        completed_jobs = model_finetuner.get_completed_jobs(limit=10)
        
        active_responses = [
            FinetuneJobResponse(
                job_id=job["job_id"],
                status=job["status"],
                progress=job["progress"],
                description=job.get("description"),
                num_samples=job.get("num_samples", 0),
                train_accuracy=None,
                validation_accuracy=None,
                f1_score=None,
                model_updated=False,
                error_message=None,
                started_at=datetime.fromisoformat(job["start_time"]) if job.get("start_time") else None,
                completed_at=None,
                created_at=datetime.fromisoformat(job["created_at"]) if job.get("created_at") else datetime.utcnow()
            )
            for job in active_jobs
        ]
        
        db_completed = db.query(DBFinetuneJob).filter(
            DBFinetuneJob.status.in_(["completed", "failed"])
        ).order_by(DBFinetuneJob.created_at.desc()).limit(10).all()
        
        completed_responses = [
            FinetuneJobResponse(
                job_id=job.job_id,
                status=job.status,
                progress=100.0,
                description=job.description,
                num_samples=job.num_samples,
                train_accuracy=job.train_accuracy,
                validation_accuracy=job.validation_accuracy,
                f1_score=job.f1_score,
                model_updated=job.model_updated,
                error_message=job.error_message,
                started_at=job.started_at,
                completed_at=job.completed_at,
                created_at=job.created_at
            )
            for job in db_completed
        ]
        
        return FinetuneJobListResponse(
            active=active_responses,
            completed=completed_responses
        )
    except Exception as e:
        logger.error(f"List finetune jobs failed: {e}")
        raise HTTPException(status_code=500, detail=f"获取任务列表失败: {str(e)}")


@app.get("/api/v1/finetune/buffer")
async def get_finetune_buffer():
    return model_finetuner.get_buffer_status()


@app.post("/api/v1/finetune/cancel/{job_id}")
async def cancel_finetune_job(job_id: str):
    try:
        success = model_finetuner.cancel_job(job_id)
        if not success:
            raise HTTPException(status_code=404, detail="任务不存在或无法取消")
        
        return {"success": True, "message": "任务已取消"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cancel finetune job failed: {e}")
        raise HTTPException(status_code=500, detail=f"取消任务失败: {str(e)}")


@app.post("/api/v1/batch/process", response_model=BatchProcessResponse)
async def start_batch_processing(
    request: BatchProcessRequest,
    db: Session = Depends(get_db)
):
    try:
        files_to_process = []
        
        if request.file_paths:
            files_to_process = [Path(f) for f in request.file_paths if os.path.exists(f)]
        
        if request.directory:
            dir_path = Path(request.directory)
            if dir_path.exists() and dir_path.is_dir():
                for ext in ['.wav', '.mp3', '.flac', '.ogg']:
                    pattern = f"**/*{ext}" if request.recursive else f"*{ext}"
                    files_to_process.extend(dir_path.glob(pattern))
        
        files_to_process = list(set(files_to_process))
        
        if not files_to_process:
            raise HTTPException(status_code=400, detail="没有找到可处理的音频文件")
        
        task_id = scheduler.submit_batch_processing(
            _batch_process_task,
            [str(f) for f in files_to_process],
            request.denoise_method,
            request.motor_type,
            request.save_features
        )
        
        batch_id = f"batch_{uuid.uuid4().hex[:8]}"
        
        db_batch = DBBatchJob(
            batch_id=batch_id,
            status="running",
            total_files=len(files_to_process),
            config=json.dumps(request.model_dump(), ensure_ascii=False),
            started_at=datetime.utcnow()
        )
        db.add(db_batch)
        db.commit()
        
        return BatchProcessResponse(
            batch_id=batch_id,
            status="running",
            total_files=len(files_to_process),
            message=f"批量处理任务已提交，处理 {len(files_to_process)} 个文件"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Start batch processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"启动批量处理失败: {str(e)}")


def _batch_process_task(
    file_paths: List[str],
    denoise_method: str,
    motor_type: str,
    save_features: bool
):
    def progress_callback(completed, total, result):
        logger.info(f"Batch progress: {completed}/{total}")
    
    result = batch_processor.process_batch(
        file_paths=file_paths,
        denoise_method=denoise_method,
        motor_type=motor_type,
        save_features=save_features,
        progress_callback=progress_callback
    )
    
    return result


@app.get("/api/v1/batch/{batch_id}/status", response_model=BatchStatusResponse)
async def get_batch_status(batch_id: str, db: Session = Depends(get_db)):
    try:
        db_batch = db.query(DBBatchJob).filter(
            DBBatchJob.batch_id == batch_id
        ).first()
        
        if not db_batch:
            raise HTTPException(status_code=404, detail="批量任务不存在")
        
        prediction_distribution = {}
        if db_batch.results:
            try:
                results = json.loads(db_batch.results)
                predictions = [r.get("prediction") for r in results.get("results", []) if r.get("prediction")]
                from collections import Counter
                prediction_distribution = dict(Counter(predictions))
            except:
                pass
        
        return BatchStatusResponse(
            batch_id=batch_id,
            status=db_batch.status,
            total_files=db_batch.total_files,
            success_count=db_batch.success_count,
            failed_count=db_batch.failed_count,
            success_rate=db_batch.success_count / max(1, db_batch.total_files),
            duration_seconds=(db_batch.completed_at - db_batch.started_at).total_seconds() 
                if db_batch.completed_at and db_batch.started_at else None,
            prediction_distribution=prediction_distribution
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get batch status failed: {e}")
        raise HTTPException(status_code=500, detail=f"获取批量状态失败: {str(e)}")


@app.get("/api/v1/batch/{batch_id}/result", response_model=BatchResultResponse)
async def get_batch_result(batch_id: str, db: Session = Depends(get_db)):
    try:
        db_batch = db.query(DBBatchJob).filter(
            DBBatchJob.batch_id == batch_id
        ).first()
        
        if not db_batch:
            raise HTTPException(status_code=404, detail="批量任务不存在")
        
        results = []
        errors = []
        statistics = {}
        
        if db_batch.results:
            try:
                results_data = json.loads(db_batch.results)
                results = results_data.get("results", [])
                errors = results_data.get("errors", [])
                statistics = batch_processor.get_statistics(type('obj', (), {'results': results, 'total_files': db_batch.total_files, 'success_count': db_batch.success_count, 'failed_count': db_batch.failed_count, 'duration': (db_batch.completed_at - db_batch.started_at).total_seconds() if db_batch.completed_at else None, 'end_time': db_batch.completed_at, 'start_time': db_batch.started_at})())
            except:
                pass
        
        return BatchResultResponse(
            batch_id=batch_id,
            total_files=db_batch.total_files,
            success_count=db_batch.success_count,
            failed_count=db_batch.failed_count,
            success_rate=db_batch.success_count / max(1, db_batch.total_files),
            results=results,
            errors=errors,
            statistics=statistics
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get batch result failed: {e}")
        raise HTTPException(status_code=500, detail=f"获取批量结果失败: {str(e)}")


@app.get("/api/v1/scheduler/status", response_model=SchedulerStatusResponse)
async def get_scheduler_status():
    try:
        metrics = scheduler.get_metrics()
        return SchedulerStatusResponse(
            total_tasks=metrics["total_tasks"],
            completed_tasks=metrics["completed_tasks"],
            active_tasks=metrics["active_tasks"],
            queued_tasks=metrics["queued_tasks"],
            failed_tasks=metrics["failed_tasks"],
            success_rate=metrics["success_rate"],
            avg_processing_time_ms=metrics["avg_processing_time_ms"],
            max_workers=metrics["max_workers"],
            utilization=metrics["utilization"]
        )
    except Exception as e:
        logger.error(f"Get scheduler status failed: {e}")
        raise HTTPException(status_code=500, detail=f"获取调度器状态失败: {str(e)}")


@app.get("/api/v1/scheduler/tasks/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    try:
        status = scheduler.get_task_status(task_id)
        
        if not status:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        return TaskStatusResponse(
            task_id=task_id,
            status=status["status"],
            progress=None,
            result=status.get("result"),
            error=status.get("error"),
            duration=status.get("duration"),
            priority=status["priority"],
            created_at=datetime.utcnow()
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get task status failed: {e}")
        raise HTTPException(status_code=500, detail=f"获取任务状态失败: {str(e)}")


@app.post("/api/v1/scheduler/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    try:
        success = scheduler.cancel_task(task_id)
        if not success:
            raise HTTPException(status_code=404, detail="任务不存在或无法取消")
        
        return {"success": True, "message": "任务已取消"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cancel task failed: {e}")
        raise HTTPException(status_code=500, detail=f"取消任务失败: {str(e)}")


@app.post("/api/v1/samples/upload", response_model=AudioUploadResponse)
async def upload_sample(
    file: UploadFile = File(...),
    motor_type: MotorTypeEnum = Query(MotorTypeEnum.INDUCTION_MOTOR),
    fault_type: Optional[FaultTypeEnum] = Query(None),
    fault_severity: Optional[str] = Query(None),
    is_labeled: bool = Query(False),
    db: Session = Depends(get_db)
):
    try:
        file_content = await file.read()
        saved_file = await storage_service.save_uploaded_file(
            file_content,
            file.filename,
            motor_type.value
        )
        
        if saved_file["audio_data"] is None:
            raise HTTPException(status_code=400, detail="无法解析音频文件")
        
        audio_data = saved_file["audio_data"]
        sample_rate = saved_file["sample_rate"] or settings.sample_rate
        
        loop = asyncio.get_event_loop()
        
        denoised_audio = await loop.run_in_executor(
            processing_executor,
            denoiser.denoise,
            audio_data,
            sample_rate,
            "adaptive_industrial"
        )
        
        features = await loop.run_in_executor(
            processing_executor,
            feature_extractor.extract_all_features,
            denoised_audio,
            sample_rate
        )
        
        prediction = None
        confidence = None
        if fault_type is None:
            prediction, confidence, _ = await loop.run_in_executor(
                processing_executor,
                classifier.classify,
                features
            )
        
        sample_id = await loop.run_in_executor(
            processing_executor,
            sample_library.add_sample,
            db,
            audio_data,
            sample_rate,
            motor_type.value,
            fault_type.value if fault_type else prediction,
            fault_severity,
            is_labeled or (fault_type is not None),
            "manual" if fault_type else "upload",
            features,
            prediction,
            confidence,
            saved_file["original_name"]
        )
        
        if is_labeled and fault_type:
            model_finetuner.add_training_sample(
                features=features,
                label=fault_type.value,
                sample_id=sample_id,
                motor_type=motor_type.value,
                source="manual_labeled",
                confidence=1.0
            )
        
        return AudioUploadResponse(
            success=True,
            sample_id=sample_id,
            message=f"样本上传成功，已保存为 {fault_type.value if fault_type else prediction}"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sample upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")


@app.get("/api/v1/samples", response_model=SampleQueryResponse)
async def get_samples(
    motor_type: Optional[str] = Query(None),
    fault_type: Optional[str] = Query(None),
    is_labeled: Optional[bool] = Query(None),
    skip: int = Query(0),
    limit: int = Query(100),
    db: Session = Depends(get_db)
):
    try:
        loop = asyncio.get_event_loop()
        total, samples = await loop.run_in_executor(
            processing_executor,
            sample_library.get_samples,
            db,
            motor_type,
            fault_type,
            is_labeled,
            skip,
            limit
        )
        
        sample_infos = [
            AudioSampleInfo(
                sample_id=s["sample_id"],
                motor_type=s["motor_type"],
                fault_type=s["fault_type"],
                fault_severity=s["fault_severity"],
                duration=s["duration"],
                sample_rate=s["sample_rate"],
                is_labeled=s["is_labeled"],
                confidence=s["confidence"],
                created_at=datetime.fromisoformat(s["created_at"]) if s["created_at"] else datetime.utcnow()
            )
            for s in samples
        ]
        
        return SampleQueryResponse(total=total, samples=sample_infos)
        
    except Exception as e:
        logger.error(f"Get samples failed: {e}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@app.get("/api/v1/samples/{sample_id}")
async def get_sample_detail(sample_id: str, db: Session = Depends(get_db)):
    try:
        loop = asyncio.get_event_loop()
        sample = await loop.run_in_executor(
            processing_executor,
            sample_library.get_sample,
            db,
            sample_id
        )
        
        if not sample:
            raise HTTPException(status_code=404, detail="样本不存在")
        
        return sample
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get sample failed: {e}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@app.get("/api/v1/samples/{sample_id}/audio")
async def get_sample_audio(sample_id: str, db: Session = Depends(get_db)):
    try:
        loop = asyncio.get_event_loop()
        audio_data = await loop.run_in_executor(
            processing_executor,
            sample_library.get_sample_audio,
            sample_id
        )
        
        if not audio_data:
            raise HTTPException(status_code=404, detail="音频不存在")
        
        audio, sample_rate = audio_data
        
        buffer = io.BytesIO()
        sf.write(buffer, audio, sample_rate, format='wav')
        buffer.seek(0)
        
        return FileResponse(
            path=sample_library._find_sample_file(sample_id),
            media_type="audio/wav",
            filename=f"{sample_id}.wav"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get sample audio failed: {e}")
        raise HTTPException(status_code=500, detail=f"获取音频失败: {str(e)}")


@app.put("/api/v1/samples/{sample_id}/label")
async def update_sample_label(
    sample_id: str,
    fault_type: FaultTypeEnum,
    fault_severity: Optional[str] = Query(None),
    add_to_training: bool = Query(True),
    db: Session = Depends(get_db)
):
    try:
        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(
            processing_executor,
            sample_library.update_sample_label,
            db,
            sample_id,
            fault_type.value,
            fault_severity,
            "manual"
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="样本不存在")
        
        if add_to_training:
            sample = sample_library.get_sample(db, sample_id)
            if sample and sample.get("features"):
                features = json.loads(sample["features"])
                model_finetuner.add_training_sample(
                    features=features,
                    label=fault_type.value,
                    sample_id=sample_id,
                    motor_type=sample.get("motor_type"),
                    source="manual_labeled",
                    confidence=1.0
                )
        
        return {"success": True, "message": "标签更新成功"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update sample label failed: {e}")
        raise HTTPException(status_code=500, detail=f"更新失败: {str(e)}")


@app.delete("/api/v1/samples/{sample_id}")
async def delete_sample(sample_id: str, db: Session = Depends(get_db)):
    try:
        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(
            processing_executor,
            sample_library.delete_sample,
            db,
            sample_id
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="样本不存在")
        
        return {"success": True, "message": "样本删除成功"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete sample failed: {e}")
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")


@app.get("/api/v1/samples/statistics")
async def get_samples_statistics(db: Session = Depends(get_db)):
    try:
        loop = asyncio.get_event_loop()
        stats = await loop.run_in_executor(
            processing_executor,
            sample_library.get_statistics,
            db
        )
        
        storage_stats = storage_service.get_storage_stats()
        
        return {
            **stats,
            "storage": storage_stats,
            "active_streams": len(stream_manager.sessions),
            "finetune_buffer": model_finetuner.get_buffer_status()
        }
        
    except Exception as e:
        logger.error(f"Get statistics failed: {e}")
        raise HTTPException(status_code=500, detail=f"获取统计失败: {str(e)}")


@app.websocket("/api/v1/stream/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    await websocket.accept()
    
    session = None
    session_id = None
    
    try:
        init_message = await websocket.receive_json()
        init_request = StreamInitRequest(**init_message)
        
        client_ip = websocket.client.host if websocket.client else "unknown"
        
        session = stream_manager.create_session(
            motor_id=init_request.motor_id,
            motor_type=init_request.motor_type.value,
            sample_rate=init_request.sample_rate,
            channels=init_request.channels,
            client_ip=client_ip
        )
        
        if not session:
            await websocket.send_json({
                "success": False,
                "message": "已达到最大并发流限制",
                "max_streams": settings.max_concurrent_streams
            })
            await websocket.close()
            return
        
        session_id = session.session_id
        
        db_session = DBStreamSession(
            session_id=session_id,
            motor_id=init_request.motor_id,
            client_ip=client_ip,
            status="active"
        )
        db.add(db_session)
        db.commit()
        
        await websocket.send_json({
            "success": True,
            "session_id": session_id,
            "message": "流会话已建立，开始发送音频数据"
        })
        
        while True:
            chunk_data = await websocket.receive_bytes()
            
            result = await session.process_chunk(chunk_data)
            
            db_session.total_chunks = session.total_chunks
            db_session.total_duration = session.total_duration
            db.commit()
            
            await websocket.send_json(result)
            
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
        try:
            await websocket.send_json({"status": "error", "message": str(e)})
        except:
            pass
    finally:
        if session_id:
            try:
                close_result = await stream_manager.close_session(session_id)
                parallel_processor.close_stream(session_id)
                
                db_session = db.query(DBStreamSession).filter(
                    DBStreamSession.session_id == session_id
                ).first()
                if db_session:
                    db_session.status = "closed"
                    db_session.end_time = datetime.utcnow()
                    db_session.total_chunks = close_result.get("total_chunks", 0)
                    db_session.total_duration = close_result.get("total_duration", 0.0)
                    db.commit()
                
                logger.info(f"Session {session_id} closed: {close_result}")
            except Exception as e:
                logger.error(f"Error closing session {session_id}: {e}")
        
        try:
            await websocket.close()
        except:
            pass


@app.get("/api/v1/stream/sessions")
async def get_stream_sessions():
    stream_sessions = stream_manager.get_active_sessions()
    parallel_sessions = parallel_processor.get_active_streams()
    stream_load = scheduler.get_stream_load()
    
    return {
        "stream_manager": stream_sessions,
        "parallel_processor": parallel_sessions,
        "capacity": stream_load
    }


@app.post("/api/v1/stream/{session_id}/close")
async def close_stream_session(session_id: str):
    result = await stream_manager.close_session(session_id)
    parallel_processor.close_stream(session_id)
    scheduler.release_stream_session(session_id)
    
    if not result:
        raise HTTPException(status_code=404, detail="会话不存在")
    return result


@app.get("/api/v1/model/info", response_model=ModelInfoResponse)
async def get_model_info():
    info = classifier.get_model_info()
    return ModelInfoResponse(
        model_name=info.get("model_name", "unknown"),
        model_version=info.get("model_version", "unknown"),
        model_type=info.get("model_type", "unknown"),
        classes=info.get("classes", []),
        accuracy=info.get("accuracy"),
        is_active=info.get("is_active", True)
    )


@app.get("/api/v1/model/features")
async def get_feature_names():
    try:
        features = feature_extractor.get_feature_names()
        return {
            "count": len(features),
            "features": features
        }
    except Exception as e:
        logger.error(f"Get feature names failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/model/statistics")
async def get_model_statistics():
    return classifier.get_statistics()


@app.get("/api/v1/diagnosis/history")
async def get_diagnosis_history(
    motor_id: Optional[str] = Query(None),
    fault_type: Optional[str] = Query(None),
    limit: int = Query(100),
    db: Session = Depends(get_db)
):
    query = db.query(DiagnosisRecord)
    
    if motor_id:
        query = query.filter(DiagnosisRecord.motor_id == motor_id)
    if fault_type:
        query = query.filter(DiagnosisRecord.fault_type == fault_type)
    
    records = query.order_by(DiagnosisRecord.created_at.desc()).limit(limit).all()
    
    return {
        "total": len(records),
        "records": [
            {
                "record_id": r.record_id,
                "sample_id": r.sample_id,
                "motor_id": r.motor_id,
                "motor_type": r.motor_type,
                "fault_type": r.fault_type,
                "confidence": r.confidence,
                "processing_time_ms": r.processing_time_ms,
                "is_realtime": r.is_realtime,
                "created_at": r.created_at.isoformat()
            }
            for r in records
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "src.main:app",
        host=settings.app_host,
        port=settings.app_port,
        log_level=settings.log_level,
        reload=True
    )
