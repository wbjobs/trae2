"""
声学样本降噪与特征分类 AI 预处理平台 - 主服务 v2.0
FastAPI 服务，对接前端控制台，提供完整的声学处理 API

新增功能：
- 音频切片：VAD 端点检测、自动切片、静音移除
- 模型微调：在线增量学习、小样本微调
- 模型版本：版本管理、回滚、热更新
- 流水线引擎：优先级调度、动态负载均衡、并发优化
"""
import asyncio
import io
import json
import logging
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from config import (
    API_HOST,
    API_PORT,
    API_RELOAD,
    CORS_ORIGINS,
    DEFAULT_DENOISE_METHOD,
    DEFAULT_FEATURE_TYPES,
    DENOISE_METHODS,
    FEATURE_TYPES,
    MODEL_LABELS,
    SAMPLE_RATE,
    get_config_summary,
)
from audio_stream import (
    AudioFileLoader,
    AudioSource,
    AudioStreamManager,
    StreamState,
)
from denoise import (
    AudioDenoiser,
    get_available_methods as get_denoise_methods,
)
from feature_extraction import (
    FeatureExtractor,
    get_available_feature_types,
)
from classifier import (
    AudioClassifier,
    ClassificationResult,
    get_available_model_types,
)
from sample_manager import SampleManager
from storage import AudioStorage
from audio_slicer import AudioSlicer, SlicerConfig
from model_finetune import ModelFinetuner, FinetuneConfig
from pipeline_engine import (
    PipelineEngine,
    PipelineStage,
    TaskPriority,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="声学样本降噪与特征分类 AI 预处理平台",
    description="支持音频流接收、降噪、特征提取、AI分类、样本库管理、音频切片、模型在线微调的完整声学处理平台",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProcessingPipeline:
    """处理流水线 v2 - 整合 PipelineEngine"""

    def __init__(self):
        self.stream_manager = AudioStreamManager()
        self.denoiser: Optional[AudioDenoiser] = None
        self.feature_extractor = FeatureExtractor()
        self.classifier: Optional[AudioClassifier] = None
        self.sample_manager = SampleManager()
        self.storage = AudioStorage()
        self.slicer = AudioSlicer()
        self.finetuner: Optional[ModelFinetuner] = None
        self.pipeline_engine: Optional[PipelineEngine] = None
        self._initialized = False

    def initialize(
        self,
        denoise_method: str = DEFAULT_DENOISE_METHOD,
        feature_types: Optional[List[str]] = None,
        model_type: str = "random_forest",
        model_path: Optional[str] = None,
        enable_pipeline_engine: bool = True,
    ):
        self.denoiser = AudioDenoiser(method=denoise_method)
        self.feature_extractor = FeatureExtractor(feature_types=feature_types or DEFAULT_FEATURE_TYPES)
        self.classifier = AudioClassifier(model_type=model_type, model_path=model_path, use_model_pool=True, pool_size=4)
        self.classifier.load_model()
        self.finetuner = ModelFinetuner(self.classifier, config=FinetuneConfig())
        if enable_pipeline_engine:
            self.pipeline_engine = PipelineEngine()
            self.pipeline_engine.start()
        self._initialized = True
        logger.info(f"Pipeline v2 initialized: denoise={denoise_method}, features={feature_types}, model={model_type}")

    def shutdown(self):
        if self.pipeline_engine:
            self.pipeline_engine.stop()
        if self.classifier:
            self.classifier.unload()
        self._initialized = False
        logger.info("Pipeline v2 shutdown complete")

    def process_audio(
        self,
        audio: np.ndarray,
        sample_rate: int = SAMPLE_RATE,
        denoise: bool = True,
        extract_features: bool = True,
        classify: bool = True,
    ) -> Dict:
        result = {
            "timestamp": time.time(),
            "sample_rate": sample_rate,
            "duration": len(audio) / sample_rate,
            "original_samples": len(audio),
        }

        processed_audio = audio
        if denoise and self.denoiser:
            self.denoiser.auto_estimate_noise(audio)
            processed_audio = self.denoiser.denoise(audio)
            result["denoised"] = True
            result["denoise_method"] = self.denoiser.method
        else:
            result["denoised"] = False

        result["processed_audio"] = processed_audio

        features = None
        if extract_features:
            features = self.feature_extractor.extract(processed_audio)
            result["features"] = {k: v.shape for k, v in features.items() if isinstance(v, np.ndarray)}
            result["features_stats"] = self.feature_extractor.extract_global_stats(processed_audio)

        classification = None
        if classify and self.classifier:
            if features:
                flattened = self.feature_extractor.extract_flattened(processed_audio)
                if len(flattened) > 0:
                    classification = self.classifier.classify(flattened)
                    result["classification"] = classification.to_dict()

        return result

    def process_file(
        self,
        file_path: str,
        save_sample: bool = True,
        label: Optional[str] = None,
        category: Optional[str] = None,
    ) -> Dict:
        filename = Path(file_path).name
        audio_data, sr = AudioFileLoader.load_audio(file_path)

        result = self.process_audio(audio_data, sr)

        if save_sample:
            sample = self.sample_manager.add_sample(
                filename=filename,
                audio_data=audio_data,
                source_type="file_upload",
                duration=len(audio_data) / sr,
                sample_rate=sr,
                label=label,
                category=category,
                metadata={
                    "duration": len(audio_data) / sr,
                    "samples": len(audio_data),
                    "denoised": result.get("denoised", False),
                },
            )

            if "features_stats" in result:
                for feat_type, feat_data in result["features_stats"].items():
                    if isinstance(feat_data, dict):
                        self.sample_manager.save_features(
                            sample.id,
                            feat_type,
                            np.array(list(feat_data.values())),
                            metadata={"stats": feat_data},
                        )

            if "classification" in result:
                cls_result = result["classification"]
                self.sample_manager.save_classification_result(
                    sample.id,
                    predicted_label=cls_result["label"],
                    confidence=cls_result["confidence"],
                    probabilities=cls_result.get("probabilities", {}),
                    model_type=self.classifier.model_type if self.classifier else "",
                    latency_ms=cls_result.get("latency_ms", 0.0),
                )

            result["sample_id"] = sample.id

        return result


pipeline = ProcessingPipeline()


# ========== 请求模型 ==========

class DenoiseRequest(BaseModel):
    method: str = Field(default=DEFAULT_DENOISE_METHOD, description="降噪方法")
    audio_data: Optional[List[float]] = None


class FeatureExtractRequest(BaseModel):
    feature_types: List[str] = Field(default=DEFAULT_FEATURE_TYPES, description="特征类型")
    audio_data: Optional[List[float]] = None


class ClassifyRequest(BaseModel):
    model_type: str = Field(default="random_forest", description="模型类型")
    features: List[float]


class SampleUpdateRequest(BaseModel):
    label: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict] = None


class ProcessRequest(BaseModel):
    denoise_method: str = DEFAULT_DENOISE_METHOD
    feature_types: List[str] = DEFAULT_FEATURE_TYPES
    model_type: str = "random_forest"
    extract_features: bool = True
    classify: bool = True
    save_sample: bool = False


class SliceRequest(BaseModel):
    audio_data: List[float]
    method: str = Field(default="vad", description="切片方法: vad/fixed")
    min_silence_duration: float = Field(default=0.3, description="最小静音时长(秒)")
    min_voice_duration: float = Field(default=0.2, description="最小语音时长(秒)")
    max_slice_duration: float = Field(default=10.0, description="最大切片时长(秒)")
    fixed_duration: float = Field(default=3.0, description="固定切片时长(秒)")
    fixed_overlap: float = Field(default=0.5, description="固定切片重叠比例")
    remove_silence: bool = Field(default=False, description="是否移除静音")


class RemoveSilenceRequest(BaseModel):
    audio_data: List[float]
    max_silence_duration: float = Field(default=0.5, description="最大保留静音时长(秒)")


class FinetuneAddSampleRequest(BaseModel):
    features: List[float]
    label: str = Field(..., description="标签，需在 MODEL_LABELS 中")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    source: str = Field(default="manual", description="样本来源")


class FinetuneTriggerRequest(BaseModel):
    force: bool = Field(default=False, description="是否强制执行，忽略间隔限制")


class ActivateVersionRequest(BaseModel):
    version: str = Field(..., description="版本号")


class PipelineTaskRequest(BaseModel):
    audio_data: List[float]
    stages: List[str] = Field(default=["denoised", "features", "classified"], description="处理阶段")
    priority: str = Field(default="normal", description="优先级: high/normal/low/background")
    timeout: float = Field(default=30.0, description="超时时间(秒)")


# ========== 启动事件 ==========

@app.on_event("startup")
async def startup_event():
    pipeline.initialize()
    logger.info("Server started and pipeline v2 initialized")


@app.on_event("shutdown")
async def shutdown_event():
    pipeline.shutdown()
    logger.info("Server shutdown complete")


# ========== 基础接口 ==========

@app.get("/")
async def root():
    return {
        "service": "声学样本降噪与特征分类 AI 预处理平台",
        "version": "2.0.0",
        "status": "running",
        "features": [
            "audio_denoise",
            "feature_extraction",
            "ai_classification",
            "sample_management",
            "audio_slicing",
            "model_finetuning",
            "pipeline_engine",
        ],
        "timestamp": time.time(),
    }


@app.get("/api/config")
async def get_config():
    return {
        "config": get_config_summary(),
        "denoise_methods": get_denoise_methods(),
        "feature_types": get_available_feature_types(),
        "model_types": get_available_model_types(),
        "model_labels": MODEL_LABELS,
        "slice_methods": ["vad", "fixed"],
        "pipeline_stages": [s.value for s in PipelineStage],
        "priorities": [p.name for p in TaskPriority],
    }


# ========== 处理接口 ==========

@app.post("/api/process/upload")
async def process_upload(
    file: UploadFile = File(...),
    denoise_method: str = Form(DEFAULT_DENOISE_METHOD),
    feature_types: str = Form(",".join(DEFAULT_FEATURE_TYPES)),
    model_type: str = Form("random_forest"),
    extract_features: bool = Form(True),
    classify: bool = Form(True),
    save_sample: bool = Form(False),
    label: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    try:
        contents = await file.read()
        file_path = Path("temp_uploads") / f"{uuid.uuid4()}_{file.filename}"
        file_path.parent.mkdir(exist_ok=True)
        file_path.write_bytes(contents)

        ft_list = [ft.strip() for ft in feature_types.split(",") if ft.strip()]

        if not pipeline._initialized:
            pipeline.initialize(
                denoise_method=denoise_method,
                feature_types=ft_list,
                model_type=model_type,
            )

        if denoise_method != pipeline.denoiser.method:
            pipeline.denoiser = AudioDenoiser(method=denoise_method)

        if set(ft_list) != set(pipeline.feature_extractor.feature_types):
            pipeline.feature_extractor = FeatureExtractor(feature_types=ft_list)

        if model_type != pipeline.classifier.model_type:
            pipeline.classifier = AudioClassifier(model_type=model_type, use_model_pool=True, pool_size=4)
            pipeline.classifier.load_model()
            pipeline.finetuner = ModelFinetuner(pipeline.classifier)

        result = pipeline.process_file(
            str(file_path),
            save_sample=save_sample,
            label=label,
            category=category,
        )

        background_tasks.add_task(file_path.unlink)

        return JSONResponse({
            "success": True,
            "filename": file.filename,
            "result": {
                k: v for k, v in result.items()
                if k != "processed_audio" and k != "features"
            },
            "features_available": "features" in result,
        })

    except Exception as e:
        logger.error(f"Process upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/process/audio")
async def process_audio_data(request: ProcessRequest):
    try:
        if not pipeline._initialized:
            pipeline.initialize(
                denoise_method=request.denoise_method,
                feature_types=request.feature_types,
                model_type=request.model_type,
            )

        if request.denoise_method != pipeline.denoiser.method:
            pipeline.denoiser = AudioDenoiser(method=request.denoise_method)

        if set(request.feature_types) != set(pipeline.feature_extractor.feature_types):
            pipeline.feature_extractor = FeatureExtractor(feature_types=request.feature_types)

        if request.model_type != pipeline.classifier.model_type:
            pipeline.classifier = AudioClassifier(model_type=request.model_type, use_model_pool=True, pool_size=4)
            pipeline.classifier.load_model()
            pipeline.finetuner = ModelFinetuner(pipeline.classifier)

        return JSONResponse({
            "success": True,
            "message": "Pipeline configured",
            "config": {
                "denoise_method": request.denoise_method,
                "feature_types": request.feature_types,
                "model_type": request.model_type,
            },
        })

    except Exception as e:
        logger.error(f"Process audio failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/denoise")
async def denoise_audio(request: DenoiseRequest):
    try:
        denoiser = AudioDenoiser(method=request.method)

        if request.audio_data is None:
            return JSONResponse({
                "method": request.method,
                "message": "Denoiser initialized, send audio data for processing",
            })

        audio = np.array(request.audio_data, dtype=np.float32)
        denoiser.auto_estimate_noise(audio)
        denoised = denoiser.denoise(audio)

        return JSONResponse({
            "success": True,
            "method": request.method,
            "denoised_audio": denoised.tolist(),
            "original_length": len(audio),
            "denoised_length": len(denoised),
        })

    except Exception as e:
        logger.error(f"Denoise failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/features/extract")
async def extract_features(request: FeatureExtractRequest):
    try:
        extractor = FeatureExtractor(feature_types=request.feature_types)

        if request.audio_data is None:
            return JSONResponse({
                "feature_types": request.feature_types,
                "dimensions": extractor.get_feature_dimensions(),
                "message": "Feature extractor initialized",
            })

        audio = np.array(request.audio_data, dtype=np.float32)
        features = extractor.extract(audio)
        stats = extractor.extract_global_stats(audio)

        return JSONResponse({
            "success": True,
            "feature_types": request.feature_types,
            "features": {k: v.tolist() for k, v in features.items() if isinstance(v, np.ndarray)},
            "feature_stats": stats,
            "dimensions": extractor.get_feature_dimensions(),
        })

    except Exception as e:
        logger.error(f"Feature extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/classify")
async def classify_audio(request: ClassifyRequest):
    try:
        classifier = AudioClassifier(model_type=request.model_type)
        classifier.load_model()

        features = np.array(request.features, dtype=np.float32)
        result = classifier.classify(features)

        return JSONResponse({
            "success": True,
            "result": result.to_dict(),
            "top_k": result.get_top_k(),
            "model_stats": classifier.get_stats(),
        })

    except Exception as e:
        logger.error(f"Classification failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 音频切片接口 ==========

@app.post("/api/slice")
async def slice_audio(request: SliceRequest):
    """音频切片 - 支持 VAD 和固定长度两种方式"""
    try:
        audio = np.array(request.audio_data, dtype=np.float32)
        config = SlicerConfig(
            min_silence_duration=request.min_silence_duration,
            min_voice_duration=request.min_voice_duration,
            max_slice_duration=request.max_slice_duration,
        )
        slicer = AudioSlicer(config=config)

        if request.remove_silence:
            audio = slicer.remove_silence(audio, max_silence_duration=request.max_silence_duration)

        if request.method == "fixed":
            slices = slicer.slice_fixed_length(
                audio,
                duration=request.fixed_duration,
                overlap=request.fixed_overlap,
            )
        else:
            slices = slicer.slice_by_voice_activity(audio)

        return JSONResponse({
            "success": True,
            "method": request.method,
            "original_duration": len(audio) / SAMPLE_RATE,
            "total_slices": len(slices),
            "total_duration": sum(s.duration for s in slices),
            "slices": [
                {
                    "index": i,
                    "start_time": s.start_time,
                    "end_time": s.end_time,
                    "duration": s.duration,
                    "rms": s.rms,
                    "peak": s.peak,
                    "has_voice": s.has_voice,
                    "audio": s.audio.tolist(),
                }
                for i, s in enumerate(slices)
            ],
        })

    except Exception as e:
        logger.error(f"Slice audio failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/remove-silence")
async def remove_silence(request: RemoveSilenceRequest):
    """移除音频中的静音片段"""
    try:
        audio = np.array(request.audio_data, dtype=np.float32)
        slicer = AudioSlicer()
        processed = slicer.remove_silence(
            audio,
            max_silence_duration=request.max_silence_duration,
        )

        return JSONResponse({
            "success": True,
            "original_duration": len(audio) / SAMPLE_RATE,
            "processed_duration": len(processed) / SAMPLE_RATE,
            "compression_ratio": len(processed) / len(audio) if len(audio) > 0 else 0,
            "audio": processed.tolist(),
        })

    except Exception as e:
        logger.error(f"Remove silence failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 模型微调接口 ==========

@app.post("/api/finetune/add-sample")
async def finetune_add_sample(request: FinetuneAddSampleRequest):
    """添加微调样本"""
    try:
        if not pipeline.finetuner:
            raise HTTPException(status_code=400, detail="Finetuner not initialized")

        features = np.array(request.features, dtype=np.float32)
        success = pipeline.finetuner.add_sample(
            features=features,
            label=request.label,
            confidence=request.confidence,
            source=request.source,
        )

        if not success:
            raise HTTPException(status_code=400, detail="Invalid sample or label")

        return JSONResponse({
            "success": True,
            "buffer_size": len(pipeline.finetuner.data_buffer),
            "buffer_counts": pipeline.finetuner.data_buffer.count_by_label(),
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Add finetune sample failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/finetune/trigger")
async def finetune_trigger(request: FinetuneTriggerRequest):
    """触发模型微调"""
    try:
        if not pipeline.finetuner:
            raise HTTPException(status_code=400, detail="Finetuner not initialized")

        result = pipeline.finetuner.finetune(force=request.force)
        return JSONResponse(result)

    except Exception as e:
        logger.error(f"Finetune trigger failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/finetune/trigger-async")
async def finetune_trigger_async():
    """异步触发模型微调（非阻塞）"""
    try:
        if not pipeline.finetuner:
            raise HTTPException(status_code=400, detail="Finetuner not initialized")

        result = pipeline.finetuner.trigger_finetune()
        return JSONResponse(result)

    except Exception as e:
        logger.error(f"Async finetune trigger failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/finetune/stats")
async def finetune_stats():
    """获取微调统计信息"""
    try:
        if not pipeline.finetuner:
            raise HTTPException(status_code=400, detail="Finetuner not initialized")

        return JSONResponse(pipeline.finetuner.get_stats())

    except Exception as e:
        logger.error(f"Get finetune stats failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/finetune/versions")
async def finetune_versions():
    """列出所有模型版本"""
    try:
        if not pipeline.finetuner:
            raise HTTPException(status_code=400, detail="Finetuner not initialized")

        return JSONResponse({"versions": pipeline.finetuner.list_versions()})

    except Exception as e:
        logger.error(f"List versions failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/finetune/activate")
async def finetune_activate_version(request: ActivateVersionRequest):
    """激活指定模型版本"""
    try:
        if not pipeline.finetuner:
            raise HTTPException(status_code=400, detail="Finetuner not initialized")

        result = pipeline.finetuner.activate_version(request.version)
        if not result["success"]:
            raise HTTPException(status_code=404, detail=result["reason"])

        return JSONResponse(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Activate version failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/finetune/rollback")
async def finetune_rollback():
    """回滚到上一个模型版本"""
    try:
        if not pipeline.finetuner:
            raise HTTPException(status_code=400, detail="Finetuner not initialized")

        result = pipeline.finetuner.rollback()
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result["reason"])

        return JSONResponse(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Rollback failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 流水线引擎接口 ==========

@app.post("/api/pipeline/submit")
async def pipeline_submit(request: PipelineTaskRequest):
    """提交任务到流水线引擎（异步处理）"""
    try:
        if not pipeline.pipeline_engine:
            raise HTTPException(status_code=400, detail="Pipeline engine not initialized")

        audio = np.array(request.audio_data, dtype=np.float32)
        try:
            priority = TaskPriority[request.priority.upper()]
        except KeyError:
            raise HTTPException(status_code=400, detail=f"Invalid priority: {request.priority}")

        stages = []
        for s in request.stages:
            try:
                stages.append(PipelineStage(s.lower()))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid stage: {s}")

        task_id = pipeline.pipeline_engine.submit_task(
            audio=audio,
            stages=stages,
            priority=priority,
            timeout=request.timeout,
        )

        return JSONResponse({
            "success": True,
            "task_id": task_id,
            "priority": priority.name,
            "stages": [s.value for s in stages],
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Pipeline submit failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/pipeline/task/{task_id}")
async def pipeline_get_task(task_id: str, wait: bool = False, timeout: float = 30.0):
    """获取流水线任务状态/结果"""
    try:
        if not pipeline.pipeline_engine:
            raise HTTPException(status_code=400, detail="Pipeline engine not initialized")

        result = pipeline.pipeline_engine.get_task_result(
            task_id,
            wait=wait,
            timeout=timeout,
        )

        if result is None:
            raise HTTPException(status_code=404, detail="Task not found")

        return JSONResponse(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get pipeline task failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/pipeline/task/{task_id}")
async def pipeline_cancel_task(task_id: str):
    """取消流水线任务"""
    try:
        if not pipeline.pipeline_engine:
            raise HTTPException(status_code=400, detail="Pipeline engine not initialized")

        success = pipeline.pipeline_engine.cancel_task(task_id)
        if not success:
            raise HTTPException(status_code=400, detail="Task cannot be cancelled")

        return JSONResponse({"success": True, "task_id": task_id})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cancel pipeline task failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/pipeline/stats")
async def pipeline_stats():
    """获取流水线引擎统计信息"""
    try:
        if not pipeline.pipeline_engine:
            raise HTTPException(status_code=400, detail="Pipeline engine not initialized")

        return JSONResponse(pipeline.pipeline_engine.get_stats())

    except Exception as e:
        logger.error(f"Get pipeline stats failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/pipeline/process-sync")
async def pipeline_process_sync(request: PipelineTaskRequest):
    """同步处理（阻塞等待结果）"""
    try:
        if not pipeline.pipeline_engine:
            raise HTTPException(status_code=400, detail="Pipeline engine not initialized")

        audio = np.array(request.audio_data, dtype=np.float32)
        stages = []
        for s in request.stages:
            try:
                stages.append(PipelineStage(s.lower()))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid stage: {s}")

        result = pipeline.pipeline_engine.process_sync(
            audio=audio,
            stages=stages,
            timeout=request.timeout,
        )

        return JSONResponse({
            "success": True,
            "result": {
                k: v.tolist() if isinstance(v, np.ndarray) else v
                for k, v in result.items()
            },
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Pipeline process sync failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 音频流接口 ==========

@app.get("/api/streams")
async def list_streams():
    return JSONResponse({
        "streams": pipeline.stream_manager.list_streams(),
        "active_count": pipeline.stream_manager.get_active_count(),
    })


@app.post("/api/streams/create")
async def create_stream(
    source: str = Query("microphone", description="音频源类型"),
    sample_rate: int = Query(SAMPLE_RATE, description="采样率"),
):
    try:
        source_type = AudioSource(source)
        stream = await pipeline.stream_manager.create_stream(
            source=source_type,
            sample_rate=sample_rate,
        )
        return JSONResponse({
            "success": True,
            "stream_id": stream.stream_id,
            "source": source,
            "sample_rate": sample_rate,
        })
    except Exception as e:
        logger.error(f"Create stream failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/streams/{stream_id}/start")
async def start_stream(stream_id: str):
    stream = pipeline.stream_manager.get_stream(stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    await stream.start()
    return JSONResponse({"success": True, "stream_id": stream_id, "state": "running"})


@app.post("/api/streams/{stream_id}/stop")
async def stop_stream(stream_id: str):
    stream = pipeline.stream_manager.get_stream(stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    await stream.stop()
    return JSONResponse({"success": True, "stream_id": stream_id, "state": "stopped"})


@app.get("/api/streams/{stream_id}")
async def get_stream_info(stream_id: str):
    stream = pipeline.stream_manager.get_stream(stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    return JSONResponse(stream.get_stats())


@app.websocket("/ws/stream/{stream_id}")
async def websocket_stream(websocket: WebSocket, stream_id: str):
    await websocket.accept()

    stream = pipeline.stream_manager.get_stream(stream_id)
    if not stream:
        await websocket.send_json({"error": "Stream not found"})
        await websocket.close()
        return

    try:
        while stream.state == StreamState.RUNNING:
            data = await websocket.receive()

            if "bytes" in data:
                audio_bytes = data["bytes"]
                await stream.write_bytes(audio_bytes)

                chunk = await stream.read_chunk(timeout=0.1)
                if chunk:
                    result = pipeline.process_audio(chunk.data, chunk.sample_rate)

                    response = {
                        "type": "processed",
                        "timestamp": chunk.timestamp,
                        "classification": result.get("classification", {}),
                        "features_info": result.get("features", {}),
                    }
                    await websocket.send_json(response)

            elif "text" in data:
                msg = json.loads(data["text"])
                if msg.get("action") == "stop":
                    break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for stream {stream_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await websocket.close()


# ========== 样本库接口 ==========

@app.get("/api/samples")
async def list_samples(
    label: Optional[str] = None,
    category: Optional[str] = None,
    source_type: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    samples = pipeline.sample_manager.list_samples(
        label=label,
        category=category,
        source_type=source_type,
        limit=limit,
        offset=offset,
    )
    return JSONResponse({
        "samples": [s.to_dict() for s in samples],
        "total": pipeline.sample_manager.count_samples(
            label=label, category=category, source_type=source_type
        ),
        "limit": limit,
        "offset": offset,
    })


@app.get("/api/samples/{sample_id}")
async def get_sample(sample_id: str):
    sample = pipeline.sample_manager.get_sample(sample_id)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    features = pipeline.sample_manager.get_features(sample_id)
    results = pipeline.sample_manager.get_classification_results(sample_id)

    return JSONResponse({
        "sample": sample.to_dict(),
        "features": features,
        "classification_results": results,
    })


@app.put("/api/samples/{sample_id}")
async def update_sample(sample_id: str, request: SampleUpdateRequest):
    success = pipeline.sample_manager.update_sample(
        sample_id,
        label=request.label,
        category=request.category,
        tags=request.tags,
        metadata=request.metadata,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Sample not found")
    return JSONResponse({"success": True, "sample_id": sample_id})


@app.delete("/api/samples/{sample_id}")
async def delete_sample(sample_id: str, permanent: bool = False):
    success = pipeline.sample_manager.delete_sample(sample_id, permanent=permanent)
    if not success:
        raise HTTPException(status_code=404, detail="Sample not found")
    return JSONResponse({"success": True, "sample_id": sample_id, "permanent": permanent})


@app.get("/api/samples/{sample_id}/download")
async def download_sample(sample_id: str):
    audio = pipeline.sample_manager.load_audio(sample_id)
    if audio is None:
        raise HTTPException(status_code=404, detail="Audio not found")

    buffer = io.BytesIO()
    try:
        import soundfile as sf
        sf.write(buffer, audio, SAMPLE_RATE, format="WAV")
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type="audio/wav",
            headers={"Content-Disposition": f"attachment; filename={sample_id}.wav"},
        )
    except ImportError:
        np.save(buffer, audio)
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={sample_id}.npy"},
        )


@app.get("/api/samples/search")
async def search_samples(query: str = Query(..., min_length=1), limit: int = 50):
    samples = pipeline.sample_manager.search_samples(query, limit=limit)
    return JSONResponse({
        "query": query,
        "results": [s.to_dict() for s in samples],
        "count": len(samples),
    })


# ========== 统计接口 ==========

@app.get("/api/statistics")
async def get_statistics():
    stats = {
        "samples": pipeline.sample_manager.get_statistics(),
        "storage": pipeline.storage.get_storage_stats(),
        "pipeline": {
            "initialized": pipeline._initialized,
            "version": "2.0.0",
            "denoiser": pipeline.denoiser.get_method_info() if pipeline.denoiser else None,
            "feature_extractor": pipeline.feature_extractor.get_config(),
            "classifier": pipeline.classifier.get_stats() if pipeline.classifier else None,
            "active_streams": pipeline.stream_manager.get_active_count(),
        },
    }
    if pipeline.finetuner:
        stats["finetune"] = pipeline.finetuner.get_stats()
    if pipeline.pipeline_engine:
        stats["pipeline_engine"] = pipeline.pipeline_engine.get_stats()
    return JSONResponse(stats)


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "2.0.0",
        "timestamp": time.time(),
        "pipeline_initialized": pipeline._initialized,
        "database_path": str(pipeline.sample_manager.db.db_path),
        "storage_dir": str(pipeline.storage.storage_dir),
        "features_enabled": {
            "audio_slicing": True,
            "model_finetuning": pipeline.finetuner is not None,
            "pipeline_engine": pipeline.pipeline_engine is not None,
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=API_HOST, port=API_PORT, reload=API_RELOAD)
