import sys
import os
from typing import List, Dict, Tuple
from datetime import datetime, date, timedelta
import numpy as np

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared import settings, PVStringData, EnergyPrediction


class EnergyPredictor:
    def __init__(self):
        self.history_data: Dict[str, List[PVStringData]] = {}
        self.MAX_HISTORY_DAYS = 30
        
    def update_history(self, string_id: str, data: PVStringData):
        if string_id not in self.history_data:
            self.history_data[string_id] = []
        self.history_data[string_id].append(data)
        
        cutoff = datetime.now() - timedelta(days=self.MAX_HISTORY_DAYS)
        self.history_data[string_id] = [
            d for d in self.history_data[string_id]
            if d.timestamp.replace(tzinfo=None) > cutoff.replace(tzinfo=None)
        ]

    def calculate_daily_energy(self, string_id: str) -> Dict[date, float]:
        if string_id not in self.history_data:
            return {}
        
        daily_energy: Dict[date, float] = {}
        for data in self.history_data[string_id]:
            d = data.timestamp.date()
            power = data.power if data.power else data.voltage * data.current
            if d not in daily_energy:
                daily_energy[d] = 0
            daily_energy[d] += power * 5 / 3600
        
        return daily_energy

    def calculate_trend_factor(self, string_id: str) -> float:
        daily_energy = self.calculate_daily_energy(string_id)
        if len(daily_energy) < 2:
            return 1.0
        
        dates = sorted(daily_energy.keys())
        recent = [daily_energy[d] for d in dates[-7:]] if len(dates) >= 7 else list(daily_energy.values())
        older = [daily_energy[d] for d in dates[-14:-7]] if len(dates) >= 14 else []
        
        if not older or not recent:
            return 1.0
        
        avg_recent = np.mean(recent)
        avg_older = np.mean(older)
        
        if avg_older == 0:
            return 1.0
        
        return min(1.2, max(0.8, avg_recent / avg_older))

    def calculate_weather_factor(self, current_data: PVStringData = None) -> float:
        if not current_data:
            return 1.0
        
        rated_power = 600.0 * 10.0
        actual_power = current_data.power if current_data.power else 0
        ratio = actual_power / rated_power if rated_power > 0 else 0
        
        if ratio > 0.8:
            return 1.2
        elif ratio > 0.5:
            return 1.0
        elif ratio > 0.3:
            return 0.8
        elif ratio > 0.1:
            return 0.5
        else:
            return 0.2

    def calculate_efficiency_factor(self, string_id: str) -> float:
        daily_energy = self.calculate_daily_energy(string_id)
        if not daily_energy:
            return 1.0
        
        avg_energy = np.mean(list(daily_energy.values()))
        max_possible = 6 * 6000 / 1000
        
        if max_possible == 0:
            return 1.0
        
        return min(1.2, max(0.5, avg_energy / max_possible))

    def generate_hourly_predictions(
        self,
        base_energy: float,
        weather_factor: float,
        efficiency_factor: float
    ) -> Dict[str, float]:
        hourly_curve = [
            0.0, 0.0, 0.0, 0.0, 0.0, 0.02,
            0.05, 0.1, 0.2, 0.4, 0.6, 0.8,
            0.95, 1.0, 0.95, 0.8, 0.6, 0.4,
            0.2, 0.1, 0.05, 0.02, 0.0, 0.0
        ]
        
        total_curve = sum(hourly_curve)
        normalized = [h / total_curve for h in hourly_curve]
        
        predictions = {}
        for hour, factor in enumerate(normalized):
            predictions[f"{hour:02d}:00"] = base_energy * factor * weather_factor * efficiency_factor
        
        return predictions

    def predict_energy(
        self,
        string_id: str,
        days: int = 7,
        current_data: PVStringData = None
    ) -> List[EnergyPrediction]:
        daily_energy = self.calculate_daily_energy(string_id)
        
        if daily_energy:
            historical_avg = np.mean(list(daily_energy.values()))
            confidence = min(0.95, 0.5 + len(daily_energy) * 0.05)
        else:
            historical_avg = 30.0
            confidence = 0.5
        
        trend_factor = self.calculate_trend_factor(string_id)
        weather_factor = self.calculate_weather_factor(current_data)
        efficiency_factor = self.calculate_efficiency_factor(string_id)
        
        predictions = []
        today = date.today()
        
        for i in range(days):
            prediction_date = today + timedelta(days=i+1)
            day_of_week = prediction_date.weekday()
            
            weekend_factor = 0.9 if day_of_week >= 5 else 1.0
            
            predicted_energy = (
                historical_avg * 
                trend_factor * 
                weather_factor * 
                efficiency_factor * 
                weekend_factor
            )
            
            hourly_predictions = self.generate_hourly_predictions(
                predicted_energy,
                weather_factor,
                efficiency_factor
            )
            
            prediction = EnergyPrediction(
                string_id=string_id,
                prediction_date=prediction_date,
                predicted_energy=round(predicted_energy, 2),
                confidence=round(confidence, 2),
                historical_avg=round(historical_avg, 2),
                trend_factor=round(trend_factor, 2),
                weather_factor=round(weather_factor, 2),
                efficiency_factor=round(efficiency_factor, 2),
                hourly_predictions={k: round(v, 2) for k, v in hourly_predictions.items()}
            )
            
            predictions.append(prediction)
        
        return predictions

    def predict_batch(
        self,
        string_ids: List[str],
        days: int = 7,
        current_data_map: Dict[str, PVStringData] = None
    ) -> Dict[str, List[EnergyPrediction]]:
        results = {}
        for string_id in string_ids:
            current_data = current_data_map.get(string_id) if current_data_map else None
            results[string_id] = self.predict_energy(string_id, days, current_data)
        return results


predictor = EnergyPredictor()
