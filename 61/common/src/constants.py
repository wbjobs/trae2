#!/usr/bin/env python3
# -*- coding: utf-8 -*-

MQTT_BROKER_HOST = "localhost"
MQTT_BROKER_PORT = 1883
MQTT_TOPIC_SENSOR_DATA = "sensor/data"
MQTT_TOPIC_CONTROL_CMD = "control/cmd"
MQTT_TOPIC_ALERT = "alert/notify"
MQTT_TOPIC_DEVICE_STATUS = "device/status"

REDIS_HOST = "localhost"
REDIS_PORT = 6379
REDIS_DB = 0

SENSOR_TYPES = {
    "temperature": "温湿度传感器",
    "humidity": "温湿度传感器",
    "current": "电流传感器",
    "voltage": "电压传感器",
    "arc": "电弧传感器",
    "smoke": "烟感传感器",
    "power": "功率传感器"
}

ALERT_LEVELS = {
    "info": 1,
    "warning": 2,
    "critical": 3,
    "emergency": 4
}

DEVICE_STATUS = {
    "online": "在线",
    "offline": "离线",
    "fault": "故障",
    "maintenance": "维护中"
}

CONTROL_TYPES = {
    "trip": "跳闸",
    "close": "合闸",
    "config": "参数配置",
    "reset": "复位"
}
