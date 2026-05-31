import os
import uuid
import json
import soundfile as sf
import numpy as np
from typing import Optional, Dict, List, Tuple, Any
from datetime import datetime
from sqlalchemy.orm import Session
import logging

from .config import settings
from .database import AudioSample, DiagnosisRecord
from .schemas import FaultTypeEnum, MotorTypeEnum

logger = logging.getLogger(__name__)


class SampleLibrary:
    def __init__(self, storage_path: Optional[str] = None):
        self.storage_path = storage_path or settings.sample_storage_path
        os.makedirs(self.storage_path, exist_ok=True)

    def add_sample(
        self,
        db: Session,
        audio_data: np.ndarray,
        sample_rate: int,
        motor_type: str,
        fault_type: Optional[str] = None,
        fault_severity: Optional[str] = None,
        is_labeled: bool = False,
        label_source: Optional[str] = None,
        features: Optional[Dict] = None,
        classification_result: Optional[str] = None,
        confidence: Optional[float] = None,
        file_name: Optional[str] = None,
        recorded_at: Optional[datetime] = None
    ) -> str:
        sample_id = f"samp_{uuid.uuid4().hex[:16]}"
        
        motor_dir = os.path.join(self.storage_path, motor_type)
        fault_dir = os.path.join(motor_dir, fault_type or "unlabeled")
        os.makedirs(fault_dir, exist_ok=True)
        
        if not file_name:
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            file_name = f"{sample_id}_{timestamp}.wav"
        
        file_path = os.path.join(fault_dir, file_name)
        
        try:
            sf.write(file_path, audio_data, sample_rate)
        except Exception as e:
            logger.error(f"Failed to save audio file: {e}")
            raise
        
        file_size = os.path.getsize(file_path)
        duration = len(audio_data) / sample_rate
        
        sample = AudioSample(
            sample_id=sample_id,
            motor_type=motor_type,
            fault_type=fault_type,
            fault_severity=fault_severity,
            file_path=file_path,
            file_name=file_name,
            duration=duration,
            sample_rate=sample_rate,
            channels=audio_data.ndim if audio_data.ndim > 1 else 1,
            file_size=file_size,
            is_labeled=is_labeled,
            label_source=label_source,
            features=json.dumps(features, ensure_ascii=False) if features else None,
            classification_result=classification_result,
            confidence=confidence,
            recorded_at=recorded_at or datetime.utcnow()
        )
        
        db.add(sample)
        db.commit()
        db.refresh(sample)
        
        logger.info(f"Added sample {sample_id} to library: {motor_type}/{fault_type}")
        return sample_id

    def get_sample(
        self,
        db: Session,
        sample_id: str
    ) -> Optional[Dict]:
        sample = db.query(AudioSample).filter(AudioSample.sample_id == sample_id).first()
        if not sample:
            return None
        return self._sample_to_dict(sample)

    def get_samples(
        self,
        db: Session,
        motor_type: Optional[str] = None,
        fault_type: Optional[str] = None,
        is_labeled: Optional[bool] = None,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[int, List[Dict]]:
        query = db.query(AudioSample)
        
        if motor_type:
            query = query.filter(AudioSample.motor_type == motor_type)
        if fault_type:
            query = query.filter(AudioSample.fault_type == fault_type)
        if is_labeled is not None:
            query = query.filter(AudioSample.is_labeled == is_labeled)
        
        total = query.count()
        samples = query.order_by(AudioSample.created_at.desc()).offset(skip).limit(limit).all()
        
        return total, [self._sample_to_dict(s) for s in samples]

    def get_sample_audio(
        self,
        sample_id: str
    ) -> Optional[Tuple[np.ndarray, int]]:
        sample_path = self._find_sample_file(sample_id)
        if not sample_path or not os.path.exists(sample_path):
            return None
        
        try:
            audio_data, sample_rate = sf.read(sample_path)
            return audio_data, sample_rate
        except Exception as e:
            logger.error(f"Failed to read sample {sample_id}: {e}")
            return None

    def update_sample_label(
        self,
        db: Session,
        sample_id: str,
        fault_type: str,
        fault_severity: Optional[str] = None,
        label_source: str = "manual"
    ) -> bool:
        sample = db.query(AudioSample).filter(AudioSample.sample_id == sample_id).first()
        if not sample:
            return False
        
        sample.fault_type = fault_type
        sample.fault_severity = fault_severity
        sample.is_labeled = True
        sample.label_source = label_source
        sample.updated_at = datetime.utcnow()
        
        db.commit()
        logger.info(f"Updated label for sample {sample_id}: {fault_type}")
        
        old_path = sample.file_path
        new_dir = os.path.join(self.storage_path, sample.motor_type, fault_type)
        os.makedirs(new_dir, exist_ok=True)
        new_path = os.path.join(new_dir, sample.file_name)
        
        if os.path.exists(old_path) and old_path != new_path:
            try:
                import shutil
                shutil.move(old_path, new_path)
                sample.file_path = new_path
                db.commit()
            except Exception as e:
                logger.warning(f"Failed to move sample file: {e}")
        
        return True

    def delete_sample(
        self,
        db: Session,
        sample_id: str
    ) -> bool:
        sample = db.query(AudioSample).filter(AudioSample.sample_id == sample_id).first()
        if not sample:
            return False
        
        try:
            if os.path.exists(sample.file_path):
                os.remove(sample.file_path)
        except Exception as e:
            logger.warning(f"Failed to delete sample file: {e}")
        
        db.delete(sample)
        db.commit()
        logger.info(f"Deleted sample {sample_id}")
        return True

    def get_statistics(
        self,
        db: Session
    ) -> Dict[str, Any]:
        stats = {
            "total_samples": db.query(AudioSample).count(),
            "labeled_samples": db.query(AudioSample).filter(AudioSample.is_labeled == True).count(),
            "unlabeled_samples": db.query(AudioSample).filter(AudioSample.is_labeled == False).count(),
            "total_duration_hours": 0.0,
            "total_size_mb": 0.0,
            "by_motor_type": {},
            "by_fault_type": {}
        }
        
        for sample in db.query(AudioSample).all():
            stats["total_duration_hours"] += sample.duration / 3600
            stats["total_size_mb"] += sample.file_size / (1024 * 1024)
            
            stats["by_motor_type"][sample.motor_type] = stats["by_motor_type"].get(sample.motor_type, 0) + 1
            if sample.fault_type:
                stats["by_fault_type"][sample.fault_type] = stats["by_fault_type"].get(sample.fault_type, 0) + 1
        
        stats["total_duration_hours"] = round(stats["total_duration_hours"], 2)
        stats["total_size_mb"] = round(stats["total_size_mb"], 2)
        
        return stats

    def export_dataset(
        self,
        db: Session,
        output_path: str,
        motor_type: Optional[str] = None,
        fault_type: Optional[str] = None,
        format: str = "json"
    ) -> str:
        _, samples = self.get_samples(db, motor_type, fault_type, limit=10000)
        
        dataset = {
            "exported_at": datetime.utcnow().isoformat(),
            "count": len(samples),
            "filter": {
                "motor_type": motor_type,
                "fault_type": fault_type
            },
            "samples": samples
        }
        
        if format == "json":
            if not output_path.endswith(".json"):
                output_path += ".json"
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(dataset, f, indent=2, ensure_ascii=False)
        elif format == "csv":
            import csv
            if not output_path.endswith(".csv"):
                output_path += ".csv"
            with open(output_path, 'w', newline='', encoding='utf-8') as f:
                if samples:
                    writer = csv.DictWriter(f, fieldnames=samples[0].keys())
                    writer.writeheader()
                    writer.writerows(samples)
        
        logger.info(f"Exported {len(samples)} samples to {output_path}")
        return output_path

    def _find_sample_file(self, sample_id: str) -> Optional[str]:
        for root, dirs, files in os.walk(self.storage_path):
            for file in files:
                if sample_id in file:
                    return os.path.join(root, file)
        return None

    def _sample_to_dict(self, sample: AudioSample) -> Dict:
        return {
            "sample_id": sample.sample_id,
            "motor_type": sample.motor_type,
            "fault_type": sample.fault_type,
            "fault_severity": sample.fault_severity,
            "file_path": sample.file_path,
            "file_name": sample.file_name,
            "duration": sample.duration,
            "sample_rate": sample.sample_rate,
            "channels": sample.channels,
            "file_size": sample.file_size,
            "is_labeled": sample.is_labeled,
            "label_source": sample.label_source,
            "classification_result": sample.classification_result,
            "confidence": sample.confidence,
            "recorded_at": sample.recorded_at.isoformat() if sample.recorded_at else None,
            "created_at": sample.created_at.isoformat() if sample.created_at else None,
            "updated_at": sample.updated_at.isoformat() if sample.updated_at else None
        }
