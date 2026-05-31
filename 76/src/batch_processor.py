import os
import io
import numpy as np
import soundfile as sf
from typing import List, Dict, Optional, Tuple, Union, Callable
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
import json
import time
from datetime import datetime
import uuid

from .config import settings
from .denoiser import AudioDenoiser
from .feature_extractor import FeatureExtractor
from .ai_classifier import AIClassifier
from .audio_segmenter import AudioSegmenter, AudioSegment

logger = logging.getLogger(__name__)


class BatchProcessingResult:
    def __init__(
        self,
        batch_id: str,
        total_files: int,
        success_count: int = 0,
        failed_count: int = 0,
        results: Optional[List[Dict]] = None,
        errors: Optional[List[Dict]] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ):
        self.batch_id = batch_id
        self.total_files = total_files
        self.success_count = success_count
        self.failed_count = failed_count
        self.results = results or []
        self.errors = errors or []
        self.start_time = start_time or datetime.utcnow()
        self.end_time = end_time
        self.metadata: Dict = {}
    
    @property
    def duration(self) -> Optional[float]:
        if self.end_time and self.start_time:
            return (self.end_time - self.start_time).total_seconds()
        return None
    
    @property
    def success_rate(self) -> float:
        if self.total_files == 0:
            return 1.0
        return self.success_count / self.total_files
    
    def to_dict(self) -> Dict:
        return {
            "batch_id": self.batch_id,
            "total_files": self.total_files,
            "success_count": self.success_count,
            "failed_count": self.failed_count,
            "success_rate": self.success_rate,
            "duration_seconds": self.duration,
            "results": self.results,
            "errors": self.errors,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "metadata": self.metadata
        }


class LargeAudioSplitter:
    def __init__(
        self,
        sample_rate: int = 16000,
        max_segment_duration: float = 30.0,
        overlap_duration: float = 1.0
    ):
        self.sample_rate = sample_rate
        self.max_segment_duration = max_segment_duration
        self.overlap_duration = overlap_duration
        self.segmenter = AudioSegmenter(sample_rate=sample_rate)
    
    def split_large_audio(
        self,
        audio: np.ndarray,
        sample_rate: Optional[int] = None,
        max_segment_duration: Optional[float] = None,
        overlap_duration: Optional[float] = None
    ) -> List[AudioSegment]:
        sr = sample_rate or self.sample_rate
        max_seg_dur = max_segment_duration or self.max_segment_duration
        overlap = overlap_duration or self.overlap_duration
        
        return self.segmenter.split_large_audio(
            audio=audio,
            sample_rate=sr,
            max_duration=max_seg_dur,
            overlap=overlap
        )
    
    def split_large_file(
        self,
        file_path: Union[str, Path],
        output_dir: Optional[Union[str, Path]] = None,
        max_segment_duration: Optional[float] = None
    ) -> List[str]:
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"Audio file not found: {file_path}")
        
        audio, sr = sf.read(str(file_path))
        
        segments = self.split_large_audio(
            audio=audio,
            sample_rate=sr,
            max_segment_duration=max_segment_duration
        )
        
        if output_dir is None:
            output_dir = file_path.parent / f"{file_path.stem}_segments"
        
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        saved_paths = []
        for i, segment in enumerate(segments):
            output_file = output_dir / f"{file_path.stem}_part{i:03d}_{segment.start_time:.1f}-{segment.end_time:.1f}.wav"
            sf.write(str(output_file), segment.audio, sr)
            saved_paths.append(str(output_file))
        
        index_data = {
            "original_file": str(file_path),
            "sample_rate": sr,
            "total_duration": len(audio) / sr,
            "segment_count": len(segments),
            "max_segment_duration": self.max_segment_duration,
            "overlap_duration": self.overlap_duration,
            "segments": [s.to_dict() for s in segments],
            "segment_files": saved_paths
        }
        
        index_file = output_dir / "segments_index.json"
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump(index_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Split {file_path.name} into {len(segments)} segments")
        return saved_paths
    
    def process_and_split(
        self,
        audio: np.ndarray,
        sample_rate: int,
        denoiser: Optional[AudioDenoiser] = None,
        detect_anomalies: bool = True
    ) -> List[AudioSegment]:
        if denoiser:
            audio = denoiser.denoise(audio, sample_rate, method='adaptive_industrial')
        
        segments = self.split_large_audio(audio, sample_rate)
        
        if detect_anomalies:
            anomaly_segments = self.segmenter.detect_anomaly_segments(
                audio, sample_rate, threshold=2.0
            )
            
            for seg in segments:
                seg.metadata['has_anomaly'] = any(
                    abs(anom.start_time - seg.start_time) < seg.duration / 2
                    for anom in anomaly_segments
                )
        
        return segments


class BatchProcessor:
    def __init__(
        self,
        denoiser: AudioDenoiser,
        feature_extractor: FeatureExtractor,
        classifier: AIClassifier,
        max_workers: int = 4
    ):
        self.denoiser = denoiser
        self.feature_extractor = feature_extractor
        self.classifier = classifier
        self.max_workers = max_workers
        self.splitter = LargeAudioSplitter(sample_rate=settings.sample_rate)
        self._active_batches: Dict[str, BatchProcessingResult] = {}
        self._batch_lock = None
    
    def _init_lock(self):
        if self._batch_lock is None:
            import threading
            self._batch_lock = threading.Lock()
    
    def process_audio_file(
        self,
        file_path: Union[str, Path],
        denoise_method: str = "adaptive_industrial",
        motor_type: str = "induction_motor",
        save_features: bool = True
    ) -> Dict:
        file_path = Path(file_path)
        
        try:
            audio, sr = sf.read(str(file_path))
            
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
            
            duration = len(audio) / sr
            
            max_duration = 60.0
            if duration > max_duration:
                return self._process_large_audio(
                    audio, sr, file_path, denoise_method, motor_type, save_features
                )
            
            denoised = self.denoiser.denoise(audio, sr, method=denoise_method)
            features = self.feature_extractor.extract_all_features(denoised, sr)
            prediction, confidence, probabilities = self.classifier.classify(features)
            
            result = {
                "file": str(file_path),
                "filename": file_path.name,
                "duration": duration,
                "sample_rate": sr,
                "num_samples": len(audio),
                "denoised": True,
                "denoise_method": denoise_method,
                "features": features if save_features else None,
                "prediction": prediction,
                "confidence": confidence,
                "probabilities": probabilities,
                "motor_type": motor_type,
                "is_split": False
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to process {file_path}: {e}")
            return {
                "file": str(file_path),
                "filename": file_path.name,
                "error": str(e),
                "failed": True
            }
    
    def _process_large_audio(
        self,
        audio: np.ndarray,
        sr: int,
        file_path: Path,
        denoise_method: str,
        motor_type: str,
        save_features: bool
    ) -> Dict:
        logger.info(f"Processing large audio file {file_path.name} ({len(audio)/sr:.1f}s)")
        
        segments = self.splitter.split_large_audio(audio, sr)
        
        segment_results = []
        for segment in segments:
            try:
                denoised = self.denoiser.denoise(
                    segment.audio, sr, method=denoise_method
                )
                features = self.feature_extractor.extract_all_features(denoised, sr)
                prediction, confidence, probabilities = self.classifier.classify(features)
                
                segment_results.append({
                    "segment_id": segment.segment_id,
                    "start_time": segment.start_time,
                    "end_time": segment.end_time,
                    "duration": segment.duration,
                    "prediction": prediction,
                    "confidence": confidence,
                    "probabilities": probabilities,
                    "features": features if save_features else None
                })
            except Exception as e:
                segment_results.append({
                    "segment_id": segment.segment_id,
                    "start_time": segment.start_time,
                    "end_time": segment.end_time,
                    "error": str(e),
                    "failed": True
                })
        
        predictions = [r["prediction"] for r in segment_results if "prediction" in r]
        confidences = [r["confidence"] for r in segment_results if "confidence" in r]
        
        if predictions:
            from collections import Counter
            most_common = Counter(predictions).most_common(1)[0][0]
            avg_confidence = float(np.mean(confidences)) if confidences else 0.0
        else:
            most_common = "unknown"
            avg_confidence = 0.0
        
        return {
            "file": str(file_path),
            "filename": file_path.name,
            "duration": len(audio) / sr,
            "sample_rate": sr,
            "num_samples": len(audio),
            "is_split": True,
            "segment_count": len(segments),
            "segments": segment_results,
            "aggregated_prediction": most_common,
            "aggregated_confidence": avg_confidence,
            "prediction_distribution": dict(Counter(predictions)),
            "motor_type": motor_type,
            "denoise_method": denoise_method
        }
    
    def process_batch(
        self,
        file_paths: List[Union[str, Path]],
        denoise_method: str = "adaptive_industrial",
        motor_type: str = "induction_motor",
        save_features: bool = False,
        progress_callback: Optional[Callable[[int, int, Dict], None]] = None
    ) -> BatchProcessingResult:
        self._init_lock()
        
        batch_id = f"batch_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        result = BatchProcessingResult(
            batch_id=batch_id,
            total_files=len(file_paths),
            start_time=datetime.utcnow()
        )
        
        self._active_batches[batch_id] = result
        
        try:
            with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                future_to_file = {
                    executor.submit(
                        self.process_audio_file,
                        file_path,
                        denoise_method,
                        motor_type,
                        save_features
                    ): file_path
                    for file_path in file_paths
                }
                
                completed = 0
                for future in as_completed(future_to_file):
                    file_path = future_to_file[future]
                    completed += 1
                    
                    try:
                        file_result = future.result()
                        
                        if file_result.get("failed"):
                            result.failed_count += 1
                            result.errors.append(file_result)
                        else:
                            result.success_count += 1
                            result.results.append(file_result)
                        
                        if progress_callback:
                            try:
                                progress_callback(completed, len(file_paths), file_result)
                            except Exception as e:
                                logger.warning(f"Progress callback error: {e}")
                    
                    except Exception as e:
                        result.failed_count += 1
                        result.errors.append({
                            "file": str(file_path),
                            "filename": Path(file_path).name,
                            "error": str(e),
                            "failed": True
                        })
        
        finally:
            result.end_time = datetime.utcnow()
        
        return result
    
    def process_directory(
        self,
        directory: Union[str, Path],
        extensions: List[str] = ['.wav', '.mp3', '.flac', '.ogg'],
        recursive: bool = True,
        **kwargs
    ) -> BatchProcessingResult:
        directory = Path(directory)
        if not directory.exists():
            raise FileNotFoundError(f"Directory not found: {directory}")
        
        files = []
        for ext in extensions:
            pattern = f"**/*{ext}" if recursive else f"*{ext}"
            files.extend(directory.glob(pattern))
        
        files = sorted(files)
        logger.info(f"Found {len(files)} audio files in {directory}")
        
        return self.process_batch(files, **kwargs)
    
    def get_batch_status(self, batch_id: str) -> Optional[BatchProcessingResult]:
        return self._active_batches.get(batch_id)
    
    def get_active_batches(self) -> List[Dict]:
        return [
            {
                "batch_id": bid,
                "total_files": result.total_files,
                "success_count": result.success_count,
                "failed_count": result.failed_count,
                "start_time": result.start_time.isoformat()
            }
            for bid, result in self._active_batches.items()
            if result.end_time is None
        ]
    
    def save_batch_result(
        self,
        result: BatchProcessingResult,
        output_dir: Union[str, Path]
    ) -> str:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        result_file = output_dir / f"batch_result_{result.batch_id}.json"
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump(result.to_dict(), f, indent=2, ensure_ascii=False)
        
        return str(result_file)
    
    def export_batch_csv(
        self,
        result: BatchProcessingResult,
        output_path: Union[str, Path]
    ) -> str:
        import csv
        
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.writer(f)
            
            headers = [
                "文件名", "时长(秒)", "预测结果", "置信度", 
                "是否分段", "分段数", "错误信息"
            ]
            writer.writerow(headers)
            
            for file_result in result.results:
                row = [
                    file_result.get("filename", ""),
                    f"{file_result.get('duration', 0):.2f}",
                    file_result.get("prediction", ""),
                    f"{file_result.get('confidence', 0):.4f}",
                    "是" if file_result.get("is_split") else "否",
                    file_result.get("segment_count", 0),
                    ""
                ]
                writer.writerow(row)
            
            for error in result.errors:
                row = [
                    error.get("filename", ""),
                    "", "", "", "", "",
                    error.get("error", "")
                ]
                writer.writerow(row)
        
        return str(output_path)
    
    def get_statistics(self, result: BatchProcessingResult) -> Dict:
        predictions = [r.get("prediction") for r in result.results if r.get("prediction")]
        confidences = [r.get("confidence", 0) for r in result.results if r.get("confidence")]
        durations = [r.get("duration", 0) for r in result.results]
        
        from collections import Counter
        prediction_counts = Counter(predictions)
        
        return {
            "total_files": result.total_files,
            "successful": result.success_count,
            "failed": result.failed_count,
            "success_rate": result.success_rate,
            "total_duration_hours": sum(durations) / 3600,
            "avg_duration": float(np.mean(durations)) if durations else 0,
            "avg_confidence": float(np.mean(confidences)) if confidences else 0,
            "min_confidence": float(np.min(confidences)) if confidences else 0,
            "max_confidence": float(np.max(confidences)) if confidences else 0,
            "prediction_distribution": dict(prediction_counts),
            "duration": result.duration,
            "processing_speed_files_per_sec": result.total_files / max(0.1, result.duration or 0.1),
            "processing_speed_hours_per_sec": sum(durations) / max(0.1, result.duration or 0.1)
        }


class ParallelStreamProcessor:
    def __init__(
        self,
        denoiser: AudioDenoiser,
        feature_extractor: FeatureExtractor,
        classifier: AIClassifier,
        max_streams: int = 10
    ):
        self.denoiser = denoiser
        self.feature_extractor = feature_extractor
        self.classifier = classifier
        self.max_streams = max_streams
        self._stream_buffers: Dict[str, List[np.ndarray]] = {}
        self._stream_metadata: Dict[str, Dict] = {}
        self._stream_lock = None
    
    def _init_lock(self):
        if self._stream_lock is None:
            import threading
            self._stream_lock = threading.Lock()
    
    def add_stream_chunk(
        self,
        stream_id: str,
        chunk: np.ndarray,
        sample_rate: int,
        motor_id: Optional[str] = None,
        motor_type: Optional[str] = None
    ) -> Optional[Dict]:
        self._init_lock()
        
        with self._stream_lock:
            if stream_id not in self._stream_buffers:
                if len(self._stream_buffers) >= self.max_streams:
                    raise RuntimeError(f"Max streams ({self.max_streams}) reached")
                
                self._stream_buffers[stream_id] = []
                self._stream_metadata[stream_id] = {
                    "created_at": datetime.utcnow(),
                    "chunk_count": 0,
                    "total_duration": 0.0,
                    "motor_id": motor_id,
                    "motor_type": motor_type,
                    "sample_rate": sample_rate,
                    "last_diagnosis_time": None
                }
            
            self._stream_buffers[stream_id].append(chunk)
            self._stream_metadata[stream_id]["chunk_count"] += 1
            self._stream_metadata[stream_id]["total_duration"] += len(chunk) / sample_rate
            
            buffer_duration = sum(len(c) for c in self._stream_buffers[stream_id]) / sample_rate
            
            diagnosis = None
            if buffer_duration >= 2.0:
                diagnosis = self._process_stream_buffer(stream_id, sample_rate)
                self._stream_buffers[stream_id] = []
            
            return {
                "stream_id": stream_id,
                "chunk_index": self._stream_metadata[stream_id]["chunk_count"],
                "total_duration": self._stream_metadata[stream_id]["total_duration"],
                "buffer_duration": buffer_duration,
                "diagnosis": diagnosis
            }
    
    def _process_stream_buffer(
        self,
        stream_id: str,
        sample_rate: int
    ) -> Dict:
        import threading
        
        buffer = self._stream_buffers[stream_id]
        audio_data = np.concatenate(buffer)
        
        def process():
            try:
                denoised = self.denoiser.denoise(
                    audio_data, sample_rate, method='adaptive_industrial'
                )
                features = self.feature_extractor.extract_all_features(denoised, sample_rate)
                prediction, confidence, probabilities = self.classifier.classify(features)
                
                return {
                    "success": True,
                    "prediction": prediction,
                    "confidence": confidence,
                    "probabilities": probabilities,
                    "features": features
                }
            except Exception as e:
                return {
                    "success": False,
                    "error": str(e)
                }
        
        result = process()
        self._stream_metadata[stream_id]["last_diagnosis_time"] = datetime.utcnow()
        
        return result
    
    def get_stream_status(self, stream_id: str) -> Optional[Dict]:
        if stream_id not in self._stream_metadata:
            return None
        
        metadata = self._stream_metadata[stream_id]
        buffer_duration = sum(
            len(c) for c in self._stream_buffers.get(stream_id, [])
        ) / metadata["sample_rate"]
        
        return {
            **metadata,
            "buffer_duration": buffer_duration,
            "created_at": metadata["created_at"].isoformat(),
            "last_diagnosis_time": metadata["last_diagnosis_time"].isoformat() 
                if metadata["last_diagnosis_time"] else None
        }
    
    def close_stream(self, stream_id: str) -> Optional[Dict]:
        self._init_lock()
        
        with self._stream_lock:
            if stream_id not in self._stream_metadata:
                return None
            
            metadata = self._stream_metadata[stream_id]
            
            if self._stream_buffers.get(stream_id):
                buffer_duration = sum(
                    len(c) for c in self._stream_buffers[stream_id]
                ) / metadata["sample_rate"]
                
                if buffer_duration >= 0.5:
                    final_diagnosis = self._process_stream_buffer(
                        stream_id, metadata["sample_rate"]
                    )
                else:
                    final_diagnosis = None
            else:
                final_diagnosis = None
            
            del self._stream_buffers[stream_id]
            del self._stream_metadata[stream_id]
            
            return {
                "stream_id": stream_id,
                "total_duration": metadata["total_duration"],
                "total_chunks": metadata["chunk_count"],
                "final_diagnosis": final_diagnosis
            }
    
    def get_active_streams(self) -> List[Dict]:
        return [
            self.get_stream_status(sid)
            for sid in self._stream_buffers.keys()
        ]
