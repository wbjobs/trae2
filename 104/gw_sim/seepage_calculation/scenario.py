import numpy as np
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class ScenarioComparator:

    def __init__(self):
        self._scenarios: Dict[str, Dict] = {}
        self._results: Dict[str, Dict] = {}

    def add_scenario(self, name: str, params: Dict) -> str:
        self._scenarios[name] = {
            "params": params,
            "created_at": datetime.utcnow().isoformat(),
            "status": "pending",
        }
        return name

    def remove_scenario(self, name: str):
        self._scenarios.pop(name, None)
        self._results.pop(name, None)

    def list_scenarios(self) -> List[Dict]:
        scenarios = []
        for name, info in self._scenarios.items():
            scenarios.append({
                "name": name,
                "status": info["status"],
                "created_at": info["created_at"],
                "has_result": name in self._results,
            })
        return scenarios

    def set_result(self, name: str, result: Dict):
        if name not in self._scenarios:
            raise ValueError(f"Scenario '{name}' not found")
        self._results[name] = result
        self._scenarios[name]["status"] = "completed"

    def get_result(self, name: str) -> Optional[Dict]:
        return self._results.get(name)

    def compare_metrics(self) -> Dict[str, Dict]:
        if not self._results:
            return {}

        comparison = {}
        all_keys = set()
        for result in self._results.values():
            h = np.array(result.get("h", result.get("h_final", result.get("h_initial", []))))
            if h.size > 0:
                all_keys.update(["mean", "min", "max", "std", "range"])

        for name, result in self._results.items():
            h = np.array(result.get("h", result.get("h_final", result.get("h_initial", []))))
            if h.size == 0:
                comparison[name] = {}
                continue

            metrics = {
                "mean": float(np.mean(h)),
                "min": float(np.min(h)),
                "max": float(np.max(h)),
                "std": float(np.std(h)),
                "range": float(np.max(h) - np.min(h)),
                "median": float(np.median(h)),
                "q25": float(np.percentile(h, 25)),
                "q75": float(np.percentile(h, 75)),
            }

            if "total_decline" in result:
                td = np.array(result["total_decline"])
                metrics["total_decline_mean"] = float(np.mean(td))
                metrics["total_decline_max"] = float(np.max(td))

            if "vx" in result and "vy" in result:
                vx = np.array(result["vx"])
                vy = np.array(result["vy"])
                speed = np.sqrt(vx**2 + vy**2)
                metrics["velocity_mean"] = float(np.mean(speed))
                metrics["velocity_max"] = float(np.max(speed))

            comparison[name] = metrics

        return comparison

    def rank_scenarios(self, metric: str = "mean", ascending: bool = True) -> List[Dict]:
        comp = self.compare_metrics()
        if not comp:
            return []

        valid = [(name, m.get(metric)) for name, m in comp.items() if metric in m and m[metric] is not None]
        valid.sort(key=lambda x: x[1], reverse=not ascending)

        return [{"rank": i + 1, "name": name, metric: value} for i, (name, value) in enumerate(valid)]

    def compute_difference(self, baseline: str, target: str) -> Dict:
        if baseline not in self._results or target not in self._results:
            raise ValueError("Both scenarios must have results")

        base_h = np.array(self._results[baseline].get("h", self._results[baseline].get("h_final", [])))
        target_h = np.array(self._results[target].get("h", self._results[target].get("h_final", [])))

        if base_h.shape != target_h.shape:
            min_shape = tuple(min(a, b) for a, b in zip(base_h.shape, target_h.shape))
            slices = tuple(slice(0, s) for s in min_shape)
            base_h = base_h[slices]
            target_h = target_h[slices]

        diff = target_h - base_h
        return {
            "baseline": baseline,
            "target": target,
            "difference_mean": float(np.mean(diff)),
            "difference_min": float(np.min(diff)),
            "difference_max": float(np.max(diff)),
            "difference_std": float(np.std(diff)),
            "abs_difference_mean": float(np.mean(np.abs(diff))),
            "difference_field": diff,
        }

    def generate_comparison_summary(self) -> Dict:
        comp = self.compare_metrics()
        if not comp:
            return {"scenarios": 0, "summary": "No results available"}

        metrics_data = {}
        for name, metrics in comp.items():
            for key, value in metrics.items():
                if key not in metrics_data:
                    metrics_data[key] = {}
                metrics_data[key][name] = value

        summary_stats = {}
        for metric, values in metrics_data.items():
            vals = [v for v in values.values() if isinstance(v, (int, float))]
            if vals:
                summary_stats[metric] = {
                    "best_scenario": min(values, key=values.get) if all(isinstance(v, (int, float)) for v in values.values()) else None,
                    "worst_scenario": max(values, key=values.get) if all(isinstance(v, (int, float)) for v in values.values()) else None,
                    "range": max(vals) - min(vals),
                    "spread_pct": (max(vals) - min(vals)) / abs(min(vals)) * 100 if min(vals) != 0 else 0,
                }

        return {
            "scenarios": len(comp),
            "scenario_names": list(comp.keys()),
            "metrics": summary_stats,
            "comparison": comp,
        }

    def get_scenario_params_batch(self) -> List[Dict]:
        batch = []
        for name, info in self._scenarios.items():
            batch.append({
                "scenario_name": name,
                "params": info["params"],
            })
        return batch

    def clear(self):
        self._scenarios.clear()
        self._results.clear()
