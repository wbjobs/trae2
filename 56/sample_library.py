import os
import shutil
import time
import uuid
from typing import List, Optional, Dict, Tuple
from datetime import datetime, timedelta
from sqlalchemy import func, and_, or_

from database import get_db, AudioSample, DeviceInfo, ProcessingLog
from schemas import SampleInfo, DeviceCreate, DeviceInfoResponse, FaultType, Severity


class SampleLibraryManager:
    def __init__(self):
        pass

    def get_samples(self, device_id: Optional[str] = None,
                    fault_type: Optional[str] = None,
                    is_labeled: Optional[bool] = None,
                    start_date: Optional[datetime] = None,
                    end_date: Optional[datetime] = None,
                    limit: int = 100,
                    offset: int = 0) -> Tuple[List[AudioSample], int]:
        db = next(get_db())

        query = db.query(AudioSample)

        if device_id:
            query = query.filter(AudioSample.device_id == device_id)
        if fault_type:
            query = query.filter(
                or_(AudioSample.fault_type == fault_type,
                    AudioSample.classification_result == fault_type)
            )
        if is_labeled is not None:
            query = query.filter(AudioSample.is_labeled == is_labeled)
        if start_date:
            query = query.filter(AudioSample.created_at >= start_date)
        if end_date:
            query = query.filter(AudioSample.created_at <= end_date)

        total = query.count()
        samples = query.order_by(AudioSample.created_at.desc()).offset(offset).limit(limit).all()

        db.close()
        return samples, total

    def get_sample(self, sample_id: str) -> Optional[AudioSample]:
        db = next(get_db())
        sample = db.query(AudioSample).filter(AudioSample.sample_id == sample_id).first()
        db.close()
        return sample

    def update_sample_label(self, sample_id: str, fault_type: str,
                            severity: Optional[str] = None) -> Dict:
        db = next(get_db())
        sample = db.query(AudioSample).filter(AudioSample.sample_id == sample_id).first()

        if not sample:
            db.close()
            return {"error": "Sample not found"}

        sample.fault_type = fault_type
        sample.fault_severity = severity or "medium"
        sample.is_labeled = True
        sample.updated_at = datetime.utcnow()

        db.commit()
        db.close()

        return {
            "sample_id": sample_id,
            "fault_type": fault_type,
            "fault_severity": severity,
            "is_labeled": True,
            "message": "Sample label updated successfully"
        }

    def delete_sample(self, sample_id: str) -> Dict:
        db = next(get_db())
        sample = db.query(AudioSample).filter(AudioSample.sample_id == sample_id).first()

        if not sample:
            db.close()
            return {"error": "Sample not found"}

        try:
            if os.path.exists(sample.file_path):
                os.remove(sample.file_path)

            denoised_path = sample.file_path.replace('.wav', '_denoised.wav')
            if os.path.exists(denoised_path):
                os.remove(denoised_path)
        except Exception as e:
            print(f"Error deleting sample files: {e}")

        db.delete(sample)
        db.commit()
        db.close()

        return {"sample_id": sample_id, "message": "Sample deleted successfully"}

    def get_statistics(self) -> Dict:
        db = next(get_db())

        total_samples = db.query(AudioSample).count()
        labeled_samples = db.query(AudioSample).filter(AudioSample.is_labeled == True).count()
        unlabeled_samples = total_samples - labeled_samples

        fault_type_stats = db.query(
            func.coalesce(AudioSample.fault_type, 'unlabeled'),
            func.count(AudioSample.id)
        ).group_by(AudioSample.fault_type).all()

        device_stats = db.query(
            AudioSample.device_id,
            func.count(AudioSample.id)
        ).group_by(AudioSample.device_id).all()

        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        recent_samples = db.query(AudioSample).filter(
            AudioSample.created_at >= seven_days_ago
        ).count()

        total_devices = db.query(DeviceInfo).count()

        avg_processing_time = db.query(
            func.avg(ProcessingLog.processing_time)
        ).filter(ProcessingLog.processing_time.isnot(None)).scalar() or 0

        fault_distribution = {}
        for fault, count in fault_type_stats:
            fault_distribution[fault or 'unlabeled'] = count

        device_distribution = {}
        for device, count in device_stats:
            device_distribution[device] = count

        db.close()

        return {
            "total_samples": total_samples,
            "labeled_samples": labeled_samples,
            "unlabeled_samples": unlabeled_samples,
            "total_devices": total_devices,
            "recent_samples_7d": recent_samples,
            "avg_processing_time_ms": float(avg_processing_time * 1000),
            "fault_distribution": fault_distribution,
            "device_distribution": device_distribution
        }

    def export_samples(self, sample_ids: List[str], output_dir: str) -> Dict:
        db = next(get_db())
        samples = db.query(AudioSample).filter(
            AudioSample.sample_id.in_(sample_ids)
        ).all()
        db.close()

        os.makedirs(output_dir, exist_ok=True)
        export_count = 0
        manifest = []

        for sample in samples:
            try:
                dest_path = os.path.join(output_dir, sample.file_name)
                if os.path.exists(sample.file_path):
                    shutil.copy2(sample.file_path, dest_path)
                    export_count += 1

                    denoised_src = sample.file_path.replace('.wav', '_denoised.wav')
                    if os.path.exists(denoised_src):
                        denoised_dest = dest_path.replace('.wav', '_denoised.wav')
                        shutil.copy2(denoised_src, denoised_dest)

                    manifest.append({
                        "sample_id": sample.sample_id,
                        "file_name": sample.file_name,
                        "device_id": sample.device_id,
                        "fault_type": sample.fault_type,
                        "is_labeled": sample.is_labeled,
                        "duration": sample.duration
                    })
            except Exception as e:
                print(f"Error exporting sample {sample.sample_id}: {e}")

        import json
        manifest_path = os.path.join(output_dir, "export_manifest.json")
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2, default=str)

        return {
            "exported_count": export_count,
            "total_requested": len(sample_ids),
            "output_dir": output_dir,
            "manifest_path": manifest_path
        }

    def add_device(self, device_data: DeviceCreate) -> Dict:
        db = next(get_db())

        existing = db.query(DeviceInfo).filter(
            DeviceInfo.device_id == device_data.device_id
        ).first()

        if existing:
            db.close()
            return {"error": "Device already exists"}

        device = DeviceInfo(
            device_id=device_data.device_id,
            device_name=device_data.device_name,
            device_type=device_data.device_type,
            location=device_data.location,
            description=device_data.description
        )

        db.add(device)
        db.commit()
        db.close()

        return {
            "device_id": device_data.device_id,
            "message": "Device added successfully"
        }

    def get_devices(self) -> List[DeviceInfo]:
        db = next(get_db())
        devices = db.query(DeviceInfo).order_by(DeviceInfo.created_at.desc()).all()
        db.close()
        return devices

    def update_device(self, device_id: str, **kwargs) -> Dict:
        db = next(get_db())
        device = db.query(DeviceInfo).filter(DeviceInfo.device_id == device_id).first()

        if not device:
            db.close()
            return {"error": "Device not found"}

        for key, value in kwargs.items():
            if hasattr(device, key) and value is not None:
                setattr(device, key, value)

        db.commit()
        db.close()

        return {"device_id": device_id, "message": "Device updated successfully"}

    def delete_device(self, device_id: str) -> Dict:
        db = next(get_db())
        device = db.query(DeviceInfo).filter(DeviceInfo.device_id == device_id).first()

        if not device:
            db.close()
            return {"error": "Device not found"}

        db.delete(device)
        db.commit()
        db.close()

        return {"device_id": device_id, "message": "Device deleted successfully"}

    def get_processing_logs(self, task_id: Optional[str] = None,
                            device_id: Optional[str] = None,
                            stage: Optional[str] = None,
                            limit: int = 100) -> List[ProcessingLog]:
        db = next(get_db())

        query = db.query(ProcessingLog)

        if task_id:
            query = query.filter(ProcessingLog.task_id == task_id)
        if device_id:
            query = query.filter(ProcessingLog.device_id == device_id)
        if stage:
            query = query.filter(ProcessingLog.stage == stage)

        logs = query.order_by(ProcessingLog.created_at.desc()).limit(limit).all()
        db.close()
        return logs

    def get_sample_processing_history(self, sample_id: str) -> List[Dict]:
        logs = self.get_processing_logs(task_id=sample_id)
        return [
            {
                "stage": log.stage,
                "status": log.status,
                "message": log.message,
                "processing_time": log.processing_time,
                "created_at": log.created_at.isoformat()
            }
            for log in logs
        ]

    def bulk_import_samples(self, source_dir: str, device_id: str,
                            fault_type: Optional[str] = None) -> Dict:
        from audio_stream_handler import save_uploaded_file
        from fastapi import UploadFile
        import io

        imported_count = 0
        failed_count = 0
        results = []

        for filename in os.listdir(source_dir):
            if not filename.lower().endswith(('.wav', '.mp3', '.flac', '.ogg')):
                continue

            file_path = os.path.join(source_dir, filename)
            try:
                with open(file_path, 'rb') as f:
                    content = f.read()

                file_like = io.BytesIO(content)
                upload_file = UploadFile(filename=filename, file=file_like)

                result = save_uploaded_file(upload_file, device_id)

                if result.status == "success":
                    imported_count += 1
                    if fault_type:
                        self.update_sample_label(result.sample_id, fault_type)
                    results.append({"filename": filename, "status": "success",
                                    "sample_id": result.sample_id})
                else:
                    failed_count += 1
                    results.append({"filename": filename, "status": "failed",
                                    "error": result.message})
            except Exception as e:
                failed_count += 1
                results.append({"filename": filename, "status": "failed", "error": str(e)})

        return {
            "imported_count": imported_count,
            "failed_count": failed_count,
            "total_files": len(results),
            "results": results
        }


sample_library = SampleLibraryManager()
