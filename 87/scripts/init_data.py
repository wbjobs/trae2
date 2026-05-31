#!/usr/bin/env python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from datetime import datetime, timedelta
import numpy as np
from backend.database.clickhouse import get_client, insert_data
from backend.utils.logger import setup_logger

logger = setup_logger("init_data")


def init_sample_devices():
    devices = [
        {
            "device_id": "P001-MOTOR-001",
            "device_name": "一号电机",
            "device_type": "motor",
            "factory_id": "factory_001",
            "factory_name": "北京第一工厂",
            "metrics": ["temperature", "vibration", "current", "speed"],
            "status": "online"
        },
        {
            "device_id": "P001-MOTOR-002",
            "device_name": "二号电机",
            "device_type": "motor",
            "factory_id": "factory_001",
            "factory_name": "北京第一工厂",
            "metrics": ["temperature", "vibration", "current", "speed"],
            "status": "online"
        },
        {
            "device_id": "P001-PUMP-001",
            "device_name": "一号水泵",
            "device_type": "pump",
            "factory_id": "factory_001",
            "factory_name": "北京第一工厂",
            "metrics": ["pressure", "flow", "current"],
            "status": "online"
        },
        {
            "device_id": "P001-TANK-001",
            "device_name": "储水罐",
            "device_type": "tank",
            "factory_id": "factory_001",
            "factory_name": "北京第一工厂",
            "metrics": ["level", "temperature"],
            "status": "online"
        },
        {
            "device_id": "P002-MOTOR-001",
            "device_name": "上海工厂一号电机",
            "device_type": "motor",
            "factory_id": "factory_002",
            "factory_name": "上海第二工厂",
            "metrics": ["temperature", "vibration", "current"],
            "status": "online"
        }
    ]
    
    client = get_client()
    client.command("TRUNCATE TABLE devices")
    
    for device in devices:
        query = f"""
            INSERT INTO devices 
            (device_id, device_name, device_type, factory_id, factory_name, metrics, status)
            VALUES
            ('{device['device_id']}', '{device['device_name']}', '{device['device_type']}', 
             '{device['factory_id']}', '{device['factory_name']}', {device['metrics']}, '{device['status']}')
        """
        client.command(query)
    
    logger.info(f"Initialized {len(devices)} devices")
    return devices


def generate_metric_data(device, metric, start_time, end_time, interval=60):
    data = []
    current = start_time
    
    base_values = {
        "temperature": 65,
        "vibration": 2.5,
        "current": 15,
        "speed": 1500,
        "pressure": 300,
        "flow": 50,
        "level": 75
    }
    
    base = base_values.get(metric, 50)
    noise_scale = base * 0.1
    
    units = {
        "temperature": "°C",
        "vibration": "mm/s",
        "current": "A",
        "speed": "rpm",
        "pressure": "kPa",
        "flow": "m³/h",
        "level": "%"
    }
    
    while current <= end_time:
        hour = current.hour
        day_factor = 1 + 0.1 * np.sin(hour * np.pi / 12)
        
        noise = np.random.normal(0, noise_scale)
        trend = (current - start_time).total_seconds() / 86400 * base * 0.05
        
        value = base * day_factor + noise + trend
        quality = 1 if abs(noise) < noise_scale * 2 else 0
        
        data.append({
            "timestamp": current,
            "device_id": device["device_id"],
            "device_type": device["device_type"],
            "factory_id": device["factory_id"],
            "metric_name": metric,
            "metric_value": round(value, 2),
            "unit": units.get(metric, "unit"),
            "quality": quality,
            "tags": {}
        })
        
        current += timedelta(seconds=interval)
    
    return data


def init_sample_metrics(days=7, interval=60):
    end_time = datetime.now()
    start_time = end_time - timedelta(days=days)
    
    devices = init_sample_devices()
    total_points = 0
    
    client = get_client()
    client.command("TRUNCATE TABLE industrial_metrics")
    
    for device in devices:
        for metric in device["metrics"]:
            logger.info(f"Generating data for {device['device_id']} - {metric}")
            data = generate_metric_data(device, metric, start_time, end_time, interval)
            
            if data:
                insert_data("industrial_metrics", data)
                total_points += len(data)
                logger.info(f"  Inserted {len(data)} points")
    
    logger.info(f"Total data points inserted: {total_points}")
    return total_points


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Initialize sample data for Industrial IoT Platform")
    parser.add_argument("--days", type=int, default=7, help="Number of days of data to generate")
    parser.add_argument("--interval", type=int, default=60, help="Data interval in seconds")
    
    args = parser.parse_args()
    
    logger.info("Starting data initialization...")
    logger.info(f"Generating {args.days} days of data with {args.interval}s interval")
    
    try:
        points = init_sample_metrics(args.days, args.interval)
        logger.info(f"Data initialization completed successfully!")
        logger.info(f"Total points: {points}")
    except Exception as e:
        logger.error(f"Data initialization failed: {e}")
        sys.exit(1)
