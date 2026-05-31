import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict
import random


class MockDataGenerator:
    def __init__(self):
        self.devices = [
            {'device_id': 'DEV001', 'device_name': '电机A1', 'device_type': 'motor', 'location': '车间1'},
            {'device_id': 'DEV002', 'device_name': '电机A2', 'device_type': 'motor', 'location': '车间1'},
            {'device_id': 'DEV003', 'device_name': '泵B1', 'device_type': 'pump', 'location': '车间2'},
            {'device_id': 'DEV004', 'device_name': '泵B2', 'device_type': 'pump', 'location': '车间2'},
            {'device_id': 'DEV005', 'device_name': '风机C1', 'device_type': 'fan', 'location': '车间3'},
            {'device_id': 'DEV006', 'device_name': '压缩机D1', 'device_type': 'compressor', 'location': '车间4'},
        ]
        
        self.metrics = {
            'motor': [
                {'name': 'temperature', 'unit': '°C', 'base': 65, 'variance': 15},
                {'name': 'vibration', 'unit': 'mm/s', 'base': 2.5, 'variance': 1.0},
                {'name': 'current', 'unit': 'A', 'base': 15, 'variance': 3},
                {'name': 'rpm', 'unit': 'rpm', 'base': 1500, 'variance': 50},
            ],
            'pump': [
                {'name': 'pressure', 'unit': 'MPa', 'base': 0.8, 'variance': 0.2},
                {'name': 'flow_rate', 'unit': 'm³/h', 'base': 120, 'variance': 20},
                {'name': 'temperature', 'unit': '°C', 'base': 55, 'variance': 10},
            ],
            'fan': [
                {'name': 'air_flow', 'unit': 'm³/min', 'base': 500, 'variance': 80},
                {'name': 'power', 'unit': 'kW', 'base': 75, 'variance': 15},
                {'name': 'vibration', 'unit': 'mm/s', 'base': 3.0, 'variance': 1.2},
            ],
            'compressor': [
                {'name': 'discharge_pressure', 'unit': 'MPa', 'base': 0.7, 'variance': 0.15},
                {'name': 'power', 'unit': 'kW', 'base': 150, 'variance': 25},
                {'name': 'temperature', 'unit': '°C', 'base': 80, 'variance': 12},
            ]
        }

    def generate_metrics_data(self, hours: int = 24, interval_minutes: int = 5) -> pd.DataFrame:
        data = []
        end_time = datetime.now()
        start_time = end_time - timedelta(hours=hours)
        
        current_time = start_time
        
        while current_time <= end_time:
            for device in self.devices:
                device_metrics = self.metrics.get(device['device_type'], [])
                for metric in device_metrics:
                    base_value = metric['base']
                    variance = metric['variance']
                    
                    noise = np.random.normal(0, variance * 0.3)
                    trend = (current_time.hour / 24) * variance * 0.5
                    
                    value = base_value + noise + trend
                    
                    if random.random() < 0.02:
                        value = base_value * (2 + random.random())
                    
                    data.append({
                        'device_id': device['device_id'],
                        'device_name': device['device_name'],
                        'device_type': device['device_type'],
                        'location': device['location'],
                        'metric_name': metric['name'],
                        'metric_value': round(value, 4),
                        'metric_unit': metric['unit'],
                        'collect_time': current_time,
                        'quality_score': random.randint(90, 100),
                        'is_valid': True
                    })
            
            current_time += timedelta(minutes=interval_minutes)
        
        return pd.DataFrame(data)

    def get_devices_list(self) -> List[Dict]:
        return self.devices

    def get_metrics_list(self) -> Dict:
        return self.metrics


mock_data_generator = MockDataGenerator()
