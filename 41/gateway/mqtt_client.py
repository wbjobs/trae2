import paho.mqtt.client as mqtt
import json
import uuid
from datetime import datetime
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared import settings, PVStringData, Command, CommandResponse


class MQTTClient:
    def __init__(self):
        self.client = mqtt.Client(client_id=f"pv-gateway-{uuid.uuid4().hex[:8]}")
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.data_callbacks = []
        self.response_callbacks = {}

    def on_connect(self, client, userdata, flags, rc):
        print(f"MQTT Connected with code {rc}")
        client.subscribe(settings.MQTT_TOPIC_DATA)
        client.subscribe(settings.MQTT_TOPIC_RESPONSE)

    def on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode())
            
            if msg.topic == settings.MQTT_TOPIC_DATA:
                self.handle_data(payload)
            elif msg.topic == settings.MQTT_TOPIC_RESPONSE:
                self.handle_response(payload)
        except Exception as e:
            print(f"Error processing MQTT message: {e}")

    def handle_data(self, payload):
        try:
            data = PVStringData(**payload)
            data.calculate_power()
            for callback in self.data_callbacks:
                callback(data)
        except Exception as e:
            print(f"Error handling data: {e}")

    def handle_response(self, payload):
        try:
            response = CommandResponse(**payload)
            cmd_id = response.command_id
            if cmd_id in self.response_callbacks:
                self.response_callbacks[cmd_id](response)
                del self.response_callbacks[cmd_id]
        except Exception as e:
            print(f"Error handling response: {e}")

    def connect(self):
        try:
            self.client.connect(settings.MQTT_BROKER, settings.MQTT_PORT, 60)
            self.client.loop_start()
        except Exception as e:
            print(f"MQTT Connection error: {e}")

    def disconnect(self):
        self.client.loop_stop()
        self.client.disconnect()

    def publish_command(self, command: Command, callback=None):
        try:
            payload = command.model_dump_json()
            self.client.publish(
                f"{settings.MQTT_TOPIC_COMMAND}/{command.device_id}",
                payload
            )
            if callback:
                self.response_callbacks[command.command_id] = callback
            return True
        except Exception as e:
            print(f"Error publishing command: {e}")
            return False

    def register_data_callback(self, callback):
        self.data_callbacks.append(callback)


mqtt_client = MQTTClient()
