#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
import math
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
from collections import deque

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))


class LoadForecaster:
    def __init__(self, config: Dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        self.window_size = config.get("forecasting", {}).get("window_size", 60)
        self.prediction_horizon = config.get("forecasting", {}).get("prediction_horizon", 30)
        self.alpha = config.get("forecasting", {}).get("alpha", 0.3)
        self.beta = config.get("forecasting", {}).get("beta", 0.1)
        
        self.data_windows: Dict[str, deque] = {}
        self.ema_values: Dict[str, float] = {}
        self.trend_values: Dict[str, float] = {}
        self.prediction_cache: Dict[str, Dict] = {}
        
        self.peak_threshold = config.get("thresholds", {}).get("current", {}).get("warning", 80)
        self.overload_threshold = config.get("thresholds", {}).get("current", {}).get("critical", 100)
        
        self.stats = {
            "total_predictions": 0,
            "peak_warnings": 0,
            "overload_predictions": 0
        }

    def add_data(self, room_id: str, device_id: str, value: float, timestamp: datetime = None):
        if timestamp is None:
            timestamp = datetime.now()
        
        key = f"{room_id}:{device_id}"
        
        if key not in self.data_windows:
            self.data_windows[key] = deque(maxlen=self.window_size)
            self.ema_values[key] = value
            self.trend_values[key] = 0.0
        
        self.data_windows[key].append((timestamp, value))
        
        if len(self.data_windows[key]) > 1:
            prev_ema = self.ema_values[key]
            prev_trend = self.trend_values[key]
            
            new_ema = self.alpha * value + (1 - self.alpha) * (prev_ema + prev_trend)
            new_trend = self.beta * (new_ema - prev_ema) + (1 - self.beta) * prev_trend
            
            self.ema_values[key] = new_ema
            self.trend_values[key] = new_trend

    def predict_simple_ma(self, room_id: str, device_id: str, steps: int = None) -> List[float]:
        if steps is None:
            steps = self.prediction_horizon
        
        key = f"{room_id}:{device_id}"
        if key not in self.data_windows or len(self.data_windows[key]) < 5:
            return []
        
        window_data = [v for _, v in self.data_windows[key]]
        ma_value = sum(window_data[-10:]) / min(10, len(window_data))
        
        predictions = []
        for i in range(steps):
            noise = 0.02 * ma_value * (2 * (i % 2) - 1)
            predictions.append(round(ma_value + noise, 2))
        
        return predictions

    def predict_ema(self, room_id: str, device_id: str, steps: int = None) -> List[float]:
        if steps is None:
            steps = self.prediction_horizon
        
        key = f"{room_id}:{device_id}"
        if key not in self.ema_values:
            return []
        
        predictions = []
        current_ema = self.ema_values[key]
        current_trend = self.trend_values[key]
        
        for i in range(steps):
            pred = current_ema + (i + 1) * current_trend
            predictions.append(round(max(0, pred), 2))
        
        return predictions

    def predict_linear_regression(self, room_id: str, device_id: str, steps: int = None) -> Tuple[List[float], Dict]:
        if steps is None:
            steps = self.prediction_horizon
        
        key = f"{room_id}:{device_id}"
        if key not in self.data_windows or len(self.data_windows[key]) < 10:
            return [], {}
        
        window_data = list(self.data_windows[key])
        n = len(window_data)
        
        x_sum = sum(range(n))
        y_sum = sum(v for _, v in window_data)
        xy_sum = sum(i * v for i, (_, v) in enumerate(window_data))
        x2_sum = sum(i * i for i in range(n))
        
        slope = (n * xy_sum - x_sum * y_sum) / (n * x2_sum - x_sum * x_sum) if (n * x2_sum - x_sum * x_sum) != 0 else 0
        intercept = (y_sum - slope * x_sum) / n
        
        predictions = []
        for i in range(n, n + steps):
            pred = intercept + slope * i
            predictions.append(round(max(0, pred), 2))
        
        return predictions, {"slope": round(slope, 4), "intercept": round(intercept, 2)}

    def predict_ensemble(self, room_id: str, device_id: str, steps: int = None) -> Dict:
        if steps is None:
            steps = self.prediction_horizon
        
        self.stats["total_predictions"] += 1
        
        ma_pred = self.predict_simple_ma(room_id, device_id, steps)
        ema_pred = self.predict_ema(room_id, device_id, steps)
        lr_pred, lr_params = self.predict_linear_regression(room_id, device_id, steps)
        
        ensemble_pred = []
        if ma_pred and ema_pred:
            for i in range(min(len(ma_pred), len(ema_pred), len(lr_pred) if lr_pred else 999)):
                if lr_pred:
                    val = 0.3 * ma_pred[i] + 0.4 * ema_pred[i] + 0.3 * lr_pred[i]
                else:
                    val = 0.4 * ma_pred[i] + 0.6 * ema_pred[i]
                ensemble_pred.append(round(val, 2))
        
        will_peak = any(p > self.peak_threshold for p in ensemble_pred) if ensemble_pred else False
        will_overload = any(p > self.overload_threshold for p in ensemble_pred) if ensemble_pred else False
        
        if will_peak:
            self.stats["peak_warnings"] += 1
        if will_overload:
            self.stats["overload_predictions"] += 1
        
        key = f"{room_id}:{device_id}"
        current_value = self.data_windows[key][-1][1] if key in self.data_windows and self.data_windows[key] else 0
        
        result = {
            "room_id": room_id,
            "device_id": device_id,
            "current_value": current_value,
            "predictions": {
                "ma": ma_pred,
                "ema": ema_pred,
                "linear_regression": lr_pred,
                "ensemble": ensemble_pred
            },
            "trend": {
                "slope": lr_params.get("slope", 0),
                "direction": "increasing" if lr_params.get("slope", 0) > 0.1 else "decreasing" if lr_params.get("slope", 0) < -0.1 else "stable"
            },
            "alerts": {
                "peak_warning": will_peak,
                "overload_warning": will_overload,
                "peak_threshold": self.peak_threshold,
                "overload_threshold": self.overload_threshold
            },
            "prediction_timestamp": datetime.now().isoformat(),
            "confidence": self._calculate_confidence(room_id, device_id)
        }
        
        self.prediction_cache[key] = result
        
        return result

    def _calculate_confidence(self, room_id: str, device_id: str) -> float:
        key = f"{room_id}:{device_id}"
        if key not in self.data_windows:
            return 0.0
        
        n = len(self.data_windows[key])
        base_confidence = min(n / self.window_size, 1.0) * 0.6
        
        window_data = [v for _, v in self.data_windows[key]]
        if len(window_data) >= 10:
            mean = sum(window_data) / len(window_data)
            variance = sum((v - mean) ** 2 for v in window_data) / len(window_data)
            std_dev = math.sqrt(variance)
            cv = std_dev / mean if mean > 0 else 1
            stability_score = max(0, 1 - cv / 0.5) * 0.4
        else:
            stability_score = 0.2
        
        return round(base_confidence + stability_score, 2)

    def get_prediction(self, room_id: str, device_id: str) -> Optional[Dict]:
        key = f"{room_id}:{device_id}"
        return self.prediction_cache.get(key)

    def get_all_predictions(self, room_ids: List[str] = None) -> Dict[str, Dict]:
        results = {}
        
        for key in self.prediction_cache:
            parts = key.split(":")
            r_id, d_id = parts[0], parts[1]
            
            if room_ids is None or r_id in room_ids:
                results[key] = self.prediction_cache[key]
        
        return results

    def get_peak_alerts(self) -> List[Dict]:
        alerts = []
        
        for key, pred in self.prediction_cache.items():
            if pred["alerts"]["peak_warning"] or pred["alerts"]["overload_warning"]:
                alerts.append({
                    "room_id": pred["room_id"],
                    "device_id": pred["device_id"],
                    "current_value": pred["current_value"],
                    "predicted_max": max(pred["predictions"]["ensemble"]) if pred["predictions"]["ensemble"] else 0,
                    "alert_type": "overload" if pred["alerts"]["overload_warning"] else "peak",
                    "confidence": pred["confidence"],
                    "timestamp": pred["prediction_timestamp"]
                })
        
        return alerts

    def get_stats(self) -> Dict:
        return {
            **self.stats,
            "monitored_devices": len(self.data_windows),
            "cached_predictions": len(self.prediction_cache),
            "window_size": self.window_size,
            "prediction_horizon": self.prediction_horizon
        }

    def get_load_summary(self, room_id: str = None) -> Dict:
        if room_id:
            devices = {k: v for k, v in self.data_windows.items() if k.startswith(f"{room_id}:")}
        else:
            devices = self.data_windows
        
        total_load = 0.0
        max_load = 0.0
        avg_load = 0.0
        count = 0
        
        for key, window in devices.items():
            if window:
                latest = window[-1][1]
                total_load += latest
                max_load = max(max_load, latest)
                count += 1
        
        if count > 0:
            avg_load = total_load / count
        
        return {
            "room_id": room_id,
            "total_load": round(total_load, 2),
            "avg_load": round(avg_load, 2),
            "max_load": round(max_load, 2),
            "device_count": count,
            "load_level": "critical" if max_load > self.overload_threshold else 
                         "warning" if max_load > self.peak_threshold else "normal",
            "timestamp": datetime.now().isoformat()
        }
