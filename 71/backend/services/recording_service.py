# -*- coding: utf-8 -*-
"""
仿真过程录制服务
Simulation recording service for frame-by-frame capture of spectral evolution.
"""

import json
import os
import uuid
import hashlib
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass, field, asdict
import copy
import numpy as np
from threading import Lock


@dataclass
class SimulationFrame:
    """单帧仿真数据"""
    frame_index: int
    timestamp: float
    wavelength: np.ndarray
    intensity: np.ndarray
    optical_path_state: Dict[str, Any] = field(default_factory=dict)
    parameter_snapshot: Dict[str, Any] = field(default_factory=dict)
    metrics: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "frame_index": self.frame_index,
            "timestamp": self.timestamp,
            "wavelength": self.wavelength.tolist() if isinstance(self.wavelength, np.ndarray) else self.wavelength,
            "intensity": self.intensity.tolist() if isinstance(self.intensity, np.ndarray) else self.intensity,
            "optical_path_state": self.optical_path_state,
            "parameter_snapshot": self.parameter_snapshot,
            "metrics": self.metrics
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SimulationFrame':
        return cls(
            frame_index=data.get("frame_index", 0),
            timestamp=data.get("timestamp", 0.0),
            wavelength=np.array(data.get("wavelength", [])),
            intensity=np.array(data.get("intensity", [])),
            optical_path_state=data.get("optical_path_state", {}),
            parameter_snapshot=data.get("parameter_snapshot", {}),
            metrics=data.get("metrics", {})
        )


@dataclass
class RecordingSession:
    """录制会话"""
    id: str = ""
    name: str = ""
    description: str = ""
    start_time: str = ""
    end_time: str = ""
    status: str = "idle"
    frame_count: int = 0
    fps: int = 30
    frames: List[SimulationFrame] = field(default_factory=list)
    initial_parameters: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "status": self.status,
            "frame_count": self.frame_count,
            "fps": self.fps,
            "frames": [f.to_dict() for f in self.frames],
            "initial_parameters": self.initial_parameters,
            "metadata": self.metadata
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'RecordingSession':
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            description=data.get("description", ""),
            start_time=data.get("start_time", ""),
            end_time=data.get("end_time", ""),
            status=data.get("status", "idle"),
            frame_count=data.get("frame_count", 0),
            fps=data.get("fps", 30),
            frames=[SimulationFrame.from_dict(f) for f in data.get("frames", [])],
            initial_parameters=data.get("initial_parameters", {}),
            metadata=data.get("metadata", {})
        )


class RecordingService:
    """仿真录制管理器"""

    def __init__(self, storage_dir: str = "recordings"):
        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)
        self.recordings: Dict[str, RecordingSession] = {}
        self.active_recording: Optional[RecordingSession] = None
        self._frame_lock = Lock()
        self._start_timestamp = 0.0
        self._load_recordings()

    def _load_recordings(self) -> None:
        """从磁盘加载所有录制"""
        try:
            for filename in os.listdir(self.storage_dir):
                if filename.endswith('.json'):
                    filepath = os.path.join(self.storage_dir, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        recording = RecordingSession.from_dict(data)
                        if recording.id:
                            self.recordings[recording.id] = recording
                    except Exception:
                        continue
        except Exception:
            pass

    def _save_recording(self, recording: RecordingSession) -> None:
        """保存录制成磁盘"""
        try:
            filename = f"recording_{recording.id}.json"
            filepath = os.path.join(self.storage_dir, filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(recording.to_dict(), f, indent=2, ensure_ascii=False)
        except Exception as e:
            raise IOError(f"保存录制失败: {str(e)}")

    def _generate_id(self, name: str) -> str:
        """生成唯一录制ID"""
        content = f"{name}_{datetime.now().isoformat()}"
        hash_str = hashlib.md5(content.encode()).hexdigest()[:8]
        return f"REC-{hash_str.upper()}"

    def start_recording(
        self,
        name: str,
        description: str = "",
        fps: int = 30,
        initial_parameters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """开始新的录制会话"""
        if self.active_recording:
            return {"error": "已有正在进行的录制", "status": "error"}

        recording_id = self._generate_id(name)
        now = datetime.now().isoformat()

        recording = RecordingSession(
            id=recording_id,
            name=name,
            description=description,
            start_time=now,
            status="recording",
            fps=fps,
            initial_parameters=copy.deepcopy(initial_parameters or {}),
            metadata={
                "created_at": now,
                "version": "1.0"
            }
        )

        self.active_recording = recording
        self.recordings[recording_id] = recording
        self._start_timestamp = datetime.now().timestamp()

        return {
            "status": "success",
            "recording_id": recording_id,
            "message": "录制已开始"
        }

    def record_frame(
        self,
        wavelength: np.ndarray,
        intensity: np.ndarray,
        optical_path_state: Optional[Dict[str, Any]] = None,
        parameter_snapshot: Optional[Dict[str, Any]] = None,
        metrics: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """录制单帧数据"""
        if not self.active_recording:
            return {"error": "没有正在进行的录制", "status": "error"}

        with self._frame_lock:
            frame_index = self.active_recording.frame_count
            timestamp = datetime.now().timestamp() - self._start_timestamp

            frame = SimulationFrame(
                frame_index=frame_index,
                timestamp=timestamp,
                wavelength=wavelength.copy() if isinstance(wavelength, np.ndarray) else np.array(wavelength),
                intensity=intensity.copy() if isinstance(intensity, np.ndarray) else np.array(intensity),
                optical_path_state=copy.deepcopy(optical_path_state or {}),
                parameter_snapshot=copy.deepcopy(parameter_snapshot or {}),
                metrics=copy.deepcopy(metrics or {})
            )

            self.active_recording.frames.append(frame)
            self.active_recording.frame_count += 1

        return {
            "status": "success",
            "frame_index": frame_index,
            "timestamp": timestamp
        }

    def stop_recording(self) -> Dict[str, Any]:
        """停止录制并保存"""
        if not self.active_recording:
            return {"error": "没有正在进行的录制", "status": "error"}

        self.active_recording.status = "completed"
        self.active_recording.end_time = datetime.now().isoformat()
        self._save_recording(self.active_recording)

        recording_id = self.active_recording.id
        frame_count = self.active_recording.frame_count
        self.active_recording = None

        return {
            "status": "success",
            "recording_id": recording_id,
            "frame_count": frame_count,
            "message": "录制已停止并保存"
        }

    def pause_recording(self) -> Dict[str, Any]:
        """暂停录制"""
        if not self.active_recording:
            return {"error": "没有正在进行的录制", "status": "error"}

        if self.active_recording.status == "recording":
            self.active_recording.status = "paused"
            return {
                "status": "success",
                "recording_id": self.active_recording.id,
                "message": "录制已暂停"
            }

        return {"error": "录制未在进行中", "status": "error"}

    def resume_recording(self) -> Dict[str, Any]:
        """恢复录制"""
        if not self.active_recording:
            return {"error": "没有正在进行的录制", "status": "error"}

        if self.active_recording.status == "paused":
            self.active_recording.status = "recording"
            return {
                "status": "success",
                "recording_id": self.active_recording.id,
                "message": "录制已恢复"
            }

        return {"error": "录制未暂停", "status": "error"}

    def get_recording_status(self) -> Dict[str, Any]:
        """获取当前录制状态"""
        if not self.active_recording:
            return {
                "status": "idle",
                "message": "无正在进行的录制"
            }

        return {
            "status": self.active_recording.status,
            "recording_id": self.active_recording.id,
            "name": self.active_recording.name,
            "frame_count": self.active_recording.frame_count,
            "duration": datetime.now().timestamp() - self._start_timestamp if self._start_timestamp > 0 else 0,
            "fps": self.active_recording.fps
        }

    def get_recording(self, recording_id: str) -> Optional[Dict[str, Any]]:
        """获取录制详情（不含帧数据）"""
        recording = self.recordings.get(recording_id)
        if not recording:
            return None

        result = recording.to_dict()
        result.pop("frames", None)
        return result

    def list_recordings(self) -> List[Dict[str, Any]]:
        """列出所有录制（不含帧数据）"""
        results = []
        for recording in self.recordings.values():
            item = recording.to_dict()
            item.pop("frames", None)
            results.append(item)

        results.sort(key=lambda x: x.get("start_time", ""), reverse=True)
        return results

    def get_frame(
        self,
        recording_id: str,
        frame_index: int
    ) -> Optional[Dict[str, Any]]:
        """获取指定帧数据"""
        recording = self.recordings.get(recording_id)
        if not recording or frame_index < 0 or frame_index >= len(recording.frames):
            return None

        return recording.frames[frame_index].to_dict()

    def get_frame_range(
        self,
        recording_id: str,
        start_frame: int = 0,
        end_frame: Optional[int] = None,
        stride: int = 1
    ) -> List[Dict[str, Any]]:
        """获取帧范围数据"""
        recording = self.recordings.get(recording_id)
        if not recording:
            return []

        end = end_frame if end_frame is not None else len(recording.frames)
        frames = recording.frames[start_frame:end:stride]

        return [f.to_dict() for f in frames]

    def export_frames_as_json(
        self,
        recording_id: str,
        output_path: str,
        start_frame: int = 0,
        end_frame: Optional[int] = None
    ) -> Dict[str, Any]:
        """导出帧数据为JSON"""
        recording = self.recordings.get(recording_id)
        if not recording:
            return {"error": "录制不存在", "status": "error"}

        try:
            end = end_frame if end_frame is not None else len(recording.frames)
            frames_data = [f.to_dict() for f in recording.frames[start_frame:end]]

            export_data = {
                "recording_id": recording_id,
                "name": recording.name,
                "export_time": datetime.now().isoformat(),
                "frame_range": {"start": start_frame, "end": end},
                "frames": frames_data
            }

            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(export_data, f, indent=2, ensure_ascii=False)

            return {
                "status": "success",
                "output_path": output_path,
                "frame_count": len(frames_data)
            }

        except Exception as e:
            return {"error": f"导出失败: {str(e)}", "status": "error"}

    def generate_playback_data(
        self,
        recording_id: str,
        speed: float = 1.0
    ) -> Dict[str, Any]:
        """生成回放数据配置"""
        recording = self.recordings.get(recording_id)
        if not recording:
            return {"error": "录制不存在", "status": "error"}

        return {
            "status": "success",
            "recording_id": recording_id,
            "name": recording.name,
            "total_frames": recording.frame_count,
            "fps": recording.fps,
            "playback_fps": int(recording.fps * speed),
            "duration_seconds": recording.frame_count / recording.fps if recording.fps > 0 else 0,
            "speed": speed
        }

    def delete_recording(self, recording_id: str) -> bool:
        """删除录制"""
        if recording_id not in self.recordings:
            return False

        if self.active_recording and self.active_recording.id == recording_id:
            self.active_recording = None

        del self.recordings[recording_id]

        try:
            filepath = os.path.join(self.storage_dir, f"recording_{recording_id}.json")
            if os.path.exists(filepath):
                os.remove(filepath)
        except Exception:
            pass

        return True

    def compute_frame_difference(
        self,
        recording_id: str,
        frame1_index: int,
        frame2_index: int
    ) -> Dict[str, Any]:
        """计算两帧之间的差异"""
        recording = self.recordings.get(recording_id)
        if not recording:
            return {"error": "录制不存在", "status": "error"}

        if frame1_index < 0 or frame1_index >= len(recording.frames):
            return {"error": "帧1索引无效", "status": "error"}
        if frame2_index < 0 or frame2_index >= len(recording.frames):
            return {"error": "帧2索引无效", "status": "error"}

        frame1 = recording.frames[frame1_index]
        frame2 = recording.frames[frame2_index]

        try:
            intensity_diff = frame2.intensity - frame1.intensity
            max_diff = float(np.max(np.abs(intensity_diff)))
            mean_diff = float(np.mean(np.abs(intensity_diff)))
            rmse = float(np.sqrt(np.mean(intensity_diff ** 2)))

            return {
                "status": "success",
                "frame1": frame1_index,
                "frame2": frame2_index,
                "time_diff": frame2.timestamp - frame1.timestamp,
                "intensity_difference": {
                    "max_absolute": max_diff,
                    "mean_absolute": mean_diff,
                    "rmse": rmse
                }
            }

        except Exception as e:
            return {"error": f"计算差异失败: {str(e)}", "status": "error"}

    def get_summary_statistics(self, recording_id: str) -> Dict[str, Any]:
        """获取录制的统计摘要"""
        recording = self.recordings.get(recording_id)
        if not recording or not recording.frames:
            return {"error": "录制不存在或无数据", "status": "error"}

        intensities = np.array([f.intensity for f in recording.frames])

        stats = {
            "status": "success",
            "recording_id": recording_id,
            "frame_count": len(recording.frames),
            "duration": recording.frames[-1].timestamp - recording.frames[0].timestamp,
            "intensity_stats": {
                "global_min": float(np.min(intensities)),
                "global_max": float(np.max(intensities)),
                "global_mean": float(np.mean(intensities)),
                "global_std": float(np.std(intensities))
            },
            "frame_stats": {
                "min_intensity_per_frame": [float(np.min(f.intensity)) for f in recording.frames],
                "max_intensity_per_frame": [float(np.max(f.intensity)) for f in recording.frames],
                "mean_intensity_per_frame": [float(np.mean(f.intensity)) for f in recording.frames]
            }
        }

        return stats
