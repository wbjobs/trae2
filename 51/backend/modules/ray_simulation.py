import numpy as np
from typing import Dict, Any, List, Tuple, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum
from scipy.spatial import distance
import time


class SimulationEventType(Enum):
    EMISSION = "emission"
    REFLECTION = "reflection"
    REFRACTION = "refraction"
    TRANSMISSION = "transmission"
    DIFFRACTION = "diffraction"
    ABSORPTION = "absorption"
    DETECTION = "detection"


@dataclass
class SimulationFrame:
    frame_index: int
    timestamp: float
    rays_data: List[Dict[str, Any]] = field(default_factory=list)
    event_type: str = ""
    element_id: str = ""
    description: str = ""


@dataclass
class Ray:
    origin: np.ndarray
    direction: np.ndarray
    wavelength: float
    intensity: float
    path: List[np.ndarray] = field(default_factory=list)
    phase: float = 0.0
    history: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class PerformanceMetrics:
    total_time: float = 0.0
    ray_count: int = 0
    total_intersections: int = 0
    avg_ray_trace_time: float = 0.0
    peak_memory_mb: float = 0.0
    events_count: Dict[str, int] = field(default_factory=dict)


class RaySimulator:
    def __init__(self):
        self.MAX_REFLECTIONS = 50
        self.EPSILON = 1e-6
        self.MAX_DISTANCE = 10000.0
        self.MIN_FOCAL_LENGTH = 0.1
        self.ENABLE_RECORDING = False
        self.MAX_FRAMES = 1000
        
        self._frames: List[SimulationFrame] = []
        self._metrics = PerformanceMetrics()
        self._progress_callback: Optional[Callable[[float, str], None]] = None
        self._current_frame = 0
        self._start_time = 0.0

    def set_progress_callback(self, callback: Callable[[float, str], None]):
        self._progress_callback = callback

    def _report_progress(self, progress: float, message: str = ""):
        if self._progress_callback:
            self._progress_callback(progress, message)

    def simulate(
        self,
        elements: List[Dict[str, Any]],
        light_source: Dict[str, Any],
        resolution: int = 100,
        enable_recording: bool = False
    ) -> Dict[str, Any]:
        self._start_time = time.time()
        self._frames = []
        self._current_frame = 0
        self.ENABLE_RECORDING = enable_recording
        self._metrics = PerformanceMetrics()
        
        self._report_progress(0.05, "初始化仿真参数...")
        
        wavelength = max(1e-9, light_source.get("wavelength", 632.8) * 1e-9)
        source_pos = np.array([
            float(light_source.get("position", {}).get("x", 0)),
            float(light_source.get("position", {}).get("y", 0)),
            float(light_source.get("position", {}).get("z", 0))
        ], dtype=np.float64)
        beam_diameter = max(0.1, float(light_source.get("beam_diameter", 5.0)))
        num_rays = max(1, int(light_source.get("num_rays", 100)))

        self._report_progress(0.1, f"生成 {num_rays} 条光线...")
        
        try:
            rays = self._generate_rays(source_pos, beam_diameter, wavelength, num_rays)
        except Exception as e:
            raise RuntimeError(f"光线生成失败: {str(e)}")
        
        self._metrics.ray_count = len(rays)
        
        self._report_progress(0.15, "解析光学元件...")
        
        try:
            element_objects = self._parse_elements(elements)
        except Exception as e:
            raise RuntimeError(f"元件解析失败: {str(e)}")
        
        self._report_progress(0.2, "开始光线追踪...")
        
        traced_rays = []
        ray_trace_times = []
        
        for i, ray in enumerate(rays):
            try:
                t0 = time.time()
                traced_ray = self._trace_ray(ray, element_objects)
                t1 = time.time()
                ray_trace_times.append(t1 - t0)
                traced_rays.append(traced_ray)
                
                if self.ENABLE_RECORDING and len(traced_ray.path) > 1:
                    self._record_ray_frame(traced_ray, i)
                
                progress = 0.2 + 0.6 * (i + 1) / num_rays
                if (i + 1) % max(1, num_rays // 10) == 0:
                    self._report_progress(progress, f"追踪光线 {i+1}/{num_rays}...")
                    
            except Exception as e:
                print(f"光线 {i} 追踪失败: {e}")
                traced_rays.append(ray)
        
        self._metrics.total_intersections = sum(len(r.path) for r in traced_rays)
        self._metrics.avg_ray_trace_time = np.mean(ray_trace_times) if ray_trace_times else 0.0
        
        self._report_progress(0.85, "收集探测器数据...")
        
        try:
            detector_data = self._collect_detector_data(traced_rays, element_objects)
        except Exception as e:
            detector_data = {"rays_count": 0, "average_intensity": 0.0, "total_intensity": 0.0, "spots": []}
            print(f"探测器数据收集失败: {e}")
        
        self._report_progress(0.9, "生成可视化数据...")
        
        visualization_data = self._prepare_visualization(traced_rays, element_objects)
        
        self._metrics.total_time = time.time() - self._start_time
        
        self._report_progress(0.95, "汇总仿真结果...")
        
        result = {
            "rays": [
                {
                    "origin": r.origin.tolist(),
                    "direction": r.direction.tolist(),
                    "path": [p.tolist() for p in r.path],
                    "intensity": float(r.intensity),
                    "wavelength": float(r.wavelength),
                    "phase": float(r.phase),
                    "history": r.history if self.ENABLE_RECORDING else []
                }
                for r in traced_rays
            ],
            "detector": detector_data,
            "visualization": visualization_data,
            "summary": {
                "total_rays": len(traced_rays),
                "rays_reaching_detector": detector_data.get("rays_count", 0),
                "average_intensity": detector_data.get("average_intensity", 0.0)
            },
            "recording": {
                "enabled": self.ENABLE_RECORDING,
                "frames": self._serialize_frames() if self.ENABLE_RECORDING else [],
                "frame_count": len(self._frames)
            },
            "performance": {
                "total_time": self._metrics.total_time,
                "avg_ray_trace_time": self._metrics.avg_ray_trace_time,
                "ray_count": self._metrics.ray_count,
                "total_intersections": self._metrics.total_intersections
            }
        }
        
        self._report_progress(1.0, "仿真完成")
        
        return result

    def _record_ray_frame(self, ray: Ray, ray_index: int):
        if self._current_frame >= self.MAX_FRAMES:
            return
            
        if len(ray.path) < 2:
            return
        
        for i in range(len(ray.path)):
            if self._current_frame >= self.MAX_FRAMES:
                break
                
            segment_ray = Ray(
                origin=ray.path[0].copy(),
                direction=ray.direction.copy(),
                wavelength=ray.wavelength,
                intensity=ray.intensity,
                path=[p.copy() for p in ray.path[:i+2]],
                phase=ray.phase
            )
            
            event_type = ""
            element_id = ""
            desc = ""
            
            if i == 0:
                event_type = SimulationEventType.EMISSION.value
                desc = f"光线发射"
            elif i < len(ray.history):
                event_type = ray.history[i].get("event_type", "")
                element_id = ray.history[i].get("element_id", "")
                desc = ray.history[i].get("description", "")
            else:
                event_type = SimulationEventType.TRANSMISSION.value
                desc = f"光线传播"
            
            frame = SimulationFrame(
                frame_index=self._current_frame,
                timestamp=time.time() - self._start_time,
                rays_data=[{
                    "origin": segment_ray.origin.tolist(),
                    "direction": segment_ray.direction.tolist(),
                    "path": [p.tolist() for p in segment_ray.path],
                    "intensity": float(segment_ray.intensity)
                }],
                event_type=event_type,
                element_id=element_id,
                description=f"光线{ray_index}: {desc}"
            )
            
            self._frames.append(frame)
            self._current_frame += 1

    def _serialize_frames(self) -> List[Dict[str, Any]]:
        return [
            {
                "frame_index": f.frame_index,
                "timestamp": f.timestamp,
                "rays": f.rays_data,
                "event_type": f.event_type,
                "element_id": f.element_id,
                "description": f.description
            }
            for f in self._frames
        ]

    def _generate_rays(
        self,
        source_pos: np.ndarray,
        beam_diameter: float,
        wavelength: float,
        num_rays: int
    ) -> List[Ray]:
        rays = []
        radius = beam_diameter / 2
        
        for i in range(num_rays):
            theta = 2 * np.pi * i / num_rays
            r = radius * np.sqrt(np.random.random()) if num_rays > 1 else 0.0
            
            offset = np.array([
                r * np.cos(theta),
                r * np.sin(theta),
                0.0
            ], dtype=np.float64)
            
            direction = np.array([1.0, 0.0, 0.0], dtype=np.float64)
            direction = direction / np.linalg.norm(direction)
            
            origin = source_pos + offset
            
            ray = Ray(
                origin=origin,
                direction=direction,
                wavelength=wavelength,
                intensity=1.0 / max(num_rays, 1),
                path=[origin.copy()]
            )
            
            if self.ENABLE_RECORDING:
                ray.history.append({
                    "event_type": SimulationEventType.EMISSION.value,
                    "element_id": "",
                    "description": "光源发射",
                    "position": origin.tolist()
                })
            
            rays.append(ray)
        
        return rays

    def _parse_elements(self, elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        parsed = []
        for elem in elements:
            try:
                pos = np.array([
                    float(elem["position"].get("x", 0)),
                    float(elem["position"].get("y", 0)),
                    float(elem["position"].get("z", 0))
                ], dtype=np.float64)
                
                elem_obj = {
                    "id": str(elem.get("id", "")),
                    "type": str(elem.get("type", "")),
                    "position": pos,
                    "parameters": elem.get("parameters", {})
                }
                parsed.append(elem_obj)
            except Exception as e:
                print(f"元件解析错误 {elem.get('id', 'unknown')}: {e}")
        
        return parsed

    def _trace_ray(self, ray: Ray, elements: List[Dict[str, Any]]) -> Ray:
        current_ray = ray
        reflections = 0
        
        while reflections < self.MAX_REFLECTIONS:
            nearest_intersection = None
            nearest_element = None
            nearest_distance = np.inf
            
            for elem in elements:
                try:
                    intersection = self._intersect_element(current_ray, elem)
                    if intersection is not None:
                        dist = np.linalg.norm(intersection - current_ray.origin)
                        if dist > self.EPSILON * 10 and dist < nearest_distance:
                            nearest_distance = dist
                            nearest_intersection = intersection
                            nearest_element = elem
                except Exception:
                    continue
            
            if nearest_intersection is None:
                end_point = current_ray.origin + current_ray.direction * 500.0
                current_ray.path.append(end_point)
                
                if self.ENABLE_RECORDING:
                    current_ray.history.append({
                        "event_type": "exit",
                        "element_id": "",
                        "description": "光线射出系统边界",
                        "position": end_point.tolist()
                    })
                break
            
            current_ray.path.append(nearest_intersection.copy())
            
            if nearest_element["type"] == "detector":
                if self.ENABLE_RECORDING:
                    current_ray.history.append({
                        "event_type": SimulationEventType.DETECTION.value,
                        "element_id": nearest_element["id"],
                        "description": "光线到达探测器",
                        "position": nearest_intersection.tolist()
                    })
                self._metrics.events_count["detection"] = self._metrics.events_count.get("detection", 0) + 1
                break
            
            try:
                new_origin, new_direction = self._interact_with_element(
                    current_ray, nearest_element, nearest_intersection
                )
            except Exception as e:
                print(f"元件交互错误: {e}")
                break
            
            if new_direction is None:
                break
            
            new_direction = new_direction / np.linalg.norm(new_direction)
            
            current_ray.origin = new_origin
            current_ray.direction = new_direction
            reflections += 1
            
            optical_path = nearest_distance * 1e-3
            current_ray.phase += (2 * np.pi / max(current_ray.wavelength, 1e-15)) * optical_path
        
        return current_ray

    def _intersect_element(self, ray: Ray, elem: Dict[str, Any]) -> Optional[np.ndarray]:
        elem_type = elem.get("type", "")
        pos = elem["position"]
        
        try:
            if elem_type in ["lens", "mirror", "beam_splitter", "filter", "waveplate", "detector"]:
                diameter = float(elem["parameters"].get("diameter", 25.4))
                return self._intersect_plane(ray, pos, np.array([1.0, 0.0, 0.0]), diameter)
            
            elif elem_type == "aperture":
                radius = float(elem["parameters"].get("radius", 5.0))
                return self._intersect_plane(ray, pos, np.array([1.0, 0.0, 0.0]), radius * 2)
            
            elif elem_type == "grating":
                return self._intersect_plane(ray, pos, np.array([1.0, 0.0, 0.0]), 25.4)
            
            elif elem_type == "prism":
                return self._intersect_prism(ray, elem)
        except Exception:
            pass
        
        return None

    def _intersect_plane(
        self,
        ray: Ray,
        plane_pos: np.ndarray,
        normal: np.ndarray,
        diameter: float
    ) -> Optional[np.ndarray]:
        denom = np.dot(ray.direction, normal)
        if abs(denom) < self.EPSILON:
            return None
        
        t = np.dot(plane_pos - ray.origin, normal) / denom
        if t < self.EPSILON or t > self.MAX_DISTANCE:
            return None
        
        intersection = ray.origin + t * ray.direction
        offset = intersection - plane_pos
        radial_dist = np.sqrt(offset[1]**2 + offset[2]**2)
        
        if radial_dist > diameter / 2 + self.EPSILON:
            return None
        
        return intersection

    def _intersect_prism(self, ray: Ray, elem: Dict[str, Any]) -> Optional[np.ndarray]:
        pos = elem["position"]
        return self._intersect_plane(ray, pos, np.array([1.0, 0.0, 0.0]), 25.4)

    def _interact_with_element(
        self,
        ray: Ray,
        elem: Dict[str, Any],
        intersection: np.ndarray
    ) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        elem_type = elem.get("type", "")
        params = elem.get("parameters", {})
        normal = np.array([1.0, 0.0, 0.0])
        
        try:
            if elem_type == "mirror":
                reflectivity = float(params.get("reflectivity", 0.95))
                reflectivity = max(0.0, min(1.0, reflectivity))
                ray.intensity *= reflectivity
                new_dir = ray.direction - 2 * np.dot(ray.direction, normal) * normal
                new_dir = new_dir / np.linalg.norm(new_dir)
                
                if self.ENABLE_RECORDING:
                    ray.history.append({
                        "event_type": SimulationEventType.REFLECTION.value,
                        "element_id": elem["id"],
                        "description": f"反射 (强度衰减 {reflectivity:.0%})",
                        "position": intersection.tolist()
                    })
                self._metrics.events_count["reflection"] = self._metrics.events_count.get("reflection", 0) + 1
                
                return intersection + self.EPSILON * 10 * new_dir, new_dir
            
            elif elem_type == "beam_splitter":
                split_ratio = float(params.get("split_ratio", 0.5))
                split_ratio = max(0.0, min(1.0, split_ratio))
                ray.intensity *= split_ratio
                
                if np.random.random() < split_ratio:
                    new_dir = ray.direction - 2 * np.dot(ray.direction, normal) * normal
                    new_dir = new_dir / np.linalg.norm(new_dir)
                    
                    if self.ENABLE_RECORDING:
                        ray.history.append({
                            "event_type": SimulationEventType.REFLECTION.value,
                            "element_id": elem["id"],
                            "description": "分光-反射路径",
                            "position": intersection.tolist()
                        })
                    
                    return intersection + self.EPSILON * 10 * new_dir, new_dir
                else:
                    if self.ENABLE_RECORDING:
                        ray.history.append({
                            "event_type": SimulationEventType.TRANSMISSION.value,
                            "element_id": elem["id"],
                            "description": "分光-透射路径",
                            "position": intersection.tolist()
                        })
                    
                    return intersection + self.EPSILON * 10 * ray.direction, ray.direction
            
            elif elem_type == "lens":
                focal_length = float(params.get("focal_length", 100.0))
                focal_length = max(self.MIN_FOCAL_LENGTH, abs(focal_length))
                
                offset = intersection - elem["position"]
                y, z = offset[1], offset[2]
                
                max_angle = np.pi / 3
                angle_x = np.clip(-y / focal_length, -max_angle, max_angle)
                angle_y = np.clip(-z / focal_length, -max_angle, max_angle)
                
                new_dir = np.array([
                    np.cos(angle_x) * np.cos(angle_y),
                    np.sin(angle_x),
                    np.sin(angle_y)
                ])
                new_dir = new_dir / np.linalg.norm(new_dir)
                
                ray.intensity *= 0.99
                
                if self.ENABLE_RECORDING:
                    ray.history.append({
                        "event_type": SimulationEventType.REFRACTION.value,
                        "element_id": elem["id"],
                        "description": f"透镜折射 (焦距 {focal_length:.1f}mm)",
                        "position": intersection.tolist()
                    })
                self._metrics.events_count["refraction"] = self._metrics.events_count.get("refraction", 0) + 1
                
                return intersection + self.EPSILON * 10 * new_dir, new_dir
            
            elif elem_type == "filter":
                transmission = float(params.get("transmission", 0.8))
                transmission = max(0.0, min(1.0, transmission))
                ray.intensity *= transmission
                
                if self.ENABLE_RECORDING:
                    ray.history.append({
                        "event_type": SimulationEventType.TRANSMISSION.value,
                        "element_id": elem["id"],
                        "description": f"滤光片 (透过率 {transmission:.0%})",
                        "position": intersection.tolist()
                    })
                
                return intersection + self.EPSILON * 10 * ray.direction, ray.direction
            
            elif elem_type == "grating":
                lines_per_mm = max(1, float(params.get("lines_per_mm", 300)))
                order = int(params.get("order", 1))
                
                d = 1e-3 / lines_per_mm
                sin_theta = order * ray.wavelength / d
                
                if abs(sin_theta) <= 1:
                    theta = np.arcsin(sin_theta)
                    new_dir = np.array([np.cos(theta), np.sin(theta), 0.0])
                    new_dir = new_dir / np.linalg.norm(new_dir)
                    
                    if self.ENABLE_RECORDING:
                        ray.history.append({
                            "event_type": SimulationEventType.DIFFRACTION.value,
                            "element_id": elem["id"],
                            "description": f"光栅衍射 ({order}级, {lines_per_mm}线/mm)",
                            "position": intersection.tolist()
                        })
                    self._metrics.events_count["diffraction"] = self._metrics.events_count.get("diffraction", 0) + 1
                    
                    return intersection + self.EPSILON * 10 * new_dir, new_dir
                
                if self.ENABLE_RECORDING:
                    ray.history.append({
                        "event_type": SimulationEventType.TRANSMISSION.value,
                        "element_id": elem["id"],
                        "description": "光栅直传",
                        "position": intersection.tolist()
                    })
                
                return intersection + self.EPSILON * 10 * ray.direction, ray.direction
            
            elif elem_type == "waveplate":
                if self.ENABLE_RECORDING:
                    ray.history.append({
                        "event_type": SimulationEventType.TRANSMISSION.value,
                        "element_id": elem["id"],
                        "description": "波片相位调制",
                        "position": intersection.tolist()
                    })
                return intersection + self.EPSILON * 10 * ray.direction, ray.direction
            
            elif elem_type == "aperture":
                radius = max(0.1, float(params.get("radius", 5.0)))
                offset = intersection - elem["position"]
                dist = np.sqrt(offset[1]**2 + offset[2]**2)
                
                if dist <= radius + self.EPSILON:
                    if self.ENABLE_RECORDING:
                        ray.history.append({
                            "event_type": SimulationEventType.TRANSMISSION.value,
                            "element_id": elem["id"],
                            "description": f"光阑通过 (半径 {radius:.1f}mm)",
                            "position": intersection.tolist()
                        })
                    return intersection + self.EPSILON * 10 * ray.direction, ray.direction
                else:
                    ray.intensity = 0.0
                    if self.ENABLE_RECORDING:
                        ray.history.append({
                            "event_type": SimulationEventType.ABSORPTION.value,
                            "element_id": elem["id"],
                            "description": f"光阑遮挡 (距离中心 {dist:.2f}mm)",
                            "position": intersection.tolist()
                        })
                    self._metrics.events_count["absorption"] = self._metrics.events_count.get("absorption", 0) + 1
                    return intersection, None
            
            if self.ENABLE_RECORDING:
                ray.history.append({
                    "event_type": SimulationEventType.TRANSMISSION.value,
                    "element_id": elem.get("id", ""),
                    "description": "元件透射",
                    "position": intersection.tolist()
                })
            
            return intersection + self.EPSILON * 10 * ray.direction, ray.direction
            
        except Exception as e:
            print(f"元件交互异常: {e}")
            return intersection + self.EPSILON * 10 * ray.direction, ray.direction

    def _collect_detector_data(
        self,
        rays: List[Ray],
        elements: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        detectors = [e for e in elements if e.get("type") == "detector"]
        if not detectors:
            return {"rays_count": 0, "average_intensity": 0.0, "total_intensity": 0.0, "spots": []}
        
        detector = detectors[0]
        det_pos = detector["position"]
        det_params = detector.get("parameters", {})
        det_radius = det_params.get("diameter", 25.4) / 2.0 if det_params.get("diameter") else 12.7
        det_radius = max(0.1, float(det_radius))
        
        spots = []
        total_intensity = 0.0
        
        for ray in rays:
            if len(ray.path) < 2:
                continue
            
            last_point = ray.path[-1]
            offset = last_point - det_pos
            dist = np.linalg.norm(offset)
            
            if dist < det_radius + 10.0 and ray.intensity > 1e-15:
                spots.append({
                    "position": [float(offset[1]), float(offset[2])],
                    "intensity": float(ray.intensity),
                    "phase": float(ray.phase)
                })
                total_intensity += float(ray.intensity)
        
        valid_spots = [s for s in spots if s["intensity"] > 0]
        
        return {
            "rays_count": len(valid_spots),
            "average_intensity": total_intensity / max(len(valid_spots), 1),
            "total_intensity": total_intensity,
            "spots": valid_spots
        }

    def _prepare_visualization(
        self,
        rays: List[Ray],
        elements: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        if not rays:
            return {
                "bounds": {"x_min": -50, "x_max": 400, "y_min": -100, "y_max": 200, "z_min": -50, "z_max": 50},
                "elements": [],
                "ray_count": 0
            }
        
        all_points = np.vstack([p for r in rays for p in r.path])
        
        margin = 50
        bounds = {
            "x_min": float(np.min(all_points[:, 0])) - margin,
            "x_max": float(np.max(all_points[:, 0])) + margin,
            "y_min": float(np.min(all_points[:, 1])) - margin,
            "y_max": float(np.max(all_points[:, 1])) + margin,
            "z_min": float(np.min(all_points[:, 2])) - margin if all_points.shape[1] > 2 else -50,
            "z_max": float(np.max(all_points[:, 2])) + margin if all_points.shape[1] > 2 else 50
        }
        
        return {
            "bounds": bounds,
            "elements": [
                {
                    "id": e["id"],
                    "type": e["type"],
                    "position": e["position"].tolist()
                }
                for e in elements
            ],
            "ray_count": len(rays)
        }


class BatchSimulator:
    def __init__(self):
        self.base_simulator = RaySimulator()
        
    def compare_configs(
        self,
        configs: List[Dict[str, Any]],
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> Dict[str, Any]:
        results = []
        comparisons = []
        
        for i, config in enumerate(configs):
            if progress_callback:
                progress_callback((i + 0.5) / len(configs), f"仿真配置 {i+1}/{len(configs)}")
            
            try:
                elements = config.get("elements", [])
                light_source = config.get("light_source", {})
                sim_type = config.get("simulation_type", "ray_tracing")
                resolution = config.get("resolution", 500)
                
                if sim_type == "ray_tracing":
                    result = self.base_simulator.simulate(
                        elements=elements,
                        light_source=light_source,
                        resolution=resolution,
                        enable_recording=False
                    )
                else:
                    from modules.interference import InterferenceCalculator
                    calc = InterferenceCalculator()
                    result = calc.calculate(
                        elements=elements,
                        light_source=light_source,
                        simulation_type=sim_type,
                        resolution=resolution
                    )
                
                results.append({
                    "config_id": config.get("id", f"config_{i}"),
                    "config_name": config.get("name", f"配置 {i+1}"),
                    "result": result
                })
                
                if progress_callback:
                    progress_callback((i + 1) / len(configs), f"完成配置 {i+1}")
                    
            except Exception as e:
                results.append({
                    "config_id": config.get("id", f"config_{i}"),
                    "config_name": config.get("name", f"配置 {i+1}"),
                    "error": str(e),
                    "result": None
                })
        
        if len(results) >= 2:
            comparisons = self._compare_results(results)
        
        return {
            "results": results,
            "comparisons": comparisons,
            "total_configs": len(configs),
            "successful": sum(1 for r in results if r.get("result") is not None)
        }
    
    def _compare_results(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        comparisons = []
        successful = [r for r in results if r.get("result") is not None]
        
        if len(successful) < 2:
            return comparisons
        
        base = successful[0]
        base_result = base["result"]
        
        for other in successful[1:]:
            other_result = other["result"]
            comparison = {
                "config_a": base["config_name"],
                "config_b": other["config_name"],
                "metrics": {}
            }
            
            if "summary" in base_result and "summary" in other_result:
                base_summary = base_result["summary"]
                other_summary = other_result["summary"]
                
                comparison["metrics"]["efficiency_diff"] = (
                    other_summary.get("rays_reaching_detector", 0) - base_summary.get("rays_reaching_detector", 0)
                )
                comparison["metrics"]["intensity_diff"] = (
                    other_summary.get("average_intensity", 0) - base_summary.get("average_intensity", 0)
                )
            
            if "contrast" in base_result and "contrast" in other_result:
                comparison["metrics"]["contrast_diff"] = (
                    other_result["contrast"] - base_result["contrast"]
                )
            
            if "performance" in other_result:
                comparison["metrics"]["computation_time"] = other_result["performance"].get("total_time", 0)
            
            comparisons.append(comparison)
        
        return comparisons
