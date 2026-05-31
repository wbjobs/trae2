import paho.mqtt.client as mqtt
import json
import time
import random
import uuid
from datetime import datetime
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared import settings, PVStringData, CommandResponse


class WeatherSimulator:
    def __init__(self):
        self.weather_types = ["sunny", "cloudy", "overcast", "rainy"]
        self.weights = [0.5, 0.25, 0.15, 0.1]
        self.current_weather = "sunny"
        self.cloud_coverage = 0.0

    def update_weather(self):
        if random.random() < 0.1:
            self.current_weather = random.choices(
                self.weather_types, weights=self.weights
            )[0]
            self.cloud_coverage = {
                "sunny": random.uniform(0, 0.2),
                "cloudy": random.uniform(0.3, 0.6),
                "overcast": random.uniform(0.7, 0.9),
                "rainy": random.uniform(0.8, 1.0)
            }[self.current_weather]
        return self.current_weather

    def get_irradiance_factor(self):
        return max(0.1, 1.0 - self.cloud_coverage * 0.8)


class EdgeDeviceSimulator:
    def __init__(self, device_id: str, weather_sim: WeatherSimulator = None):
        self.device_id = device_id
        self.client = mqtt.Client(client_id=f"edge-{device_id}-{uuid.uuid4().hex[:8]}")
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.running = False
        self.base_voltage = 550.0
        self.base_current = 8.0
        self.base_temp = 40.0
        self.weather_sim = weather_sim or WeatherSimulator()
        self.command_queue = []
        self.last_command_time = 0
        self.COMMAND_COOLDOWN = 10

    def on_connect(self, client, userdata, flags, rc):
        print(f"[{self.device_id}] MQTT Connected with code {rc}")
        client.subscribe(f"pv/command/{self.device_id}")
        client.publish(
            f"pv/status/{self.device_id}",
            json.dumps({
                "device_id": self.device_id,
                "status": "online",
                "timestamp": datetime.now().isoformat()
            }),
            qos=1,
            retain=True
        )

    def on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode())
            print(f"[{self.device_id}] Received command: {payload}")
            self.command_queue.append(payload)
        except Exception as e:
            print(f"[{self.device_id}] Error processing command: {e}")

    def process_commands(self):
        now = time.time()
        if now - self.last_command_time < self.COMMAND_COOLDOWN:
            return

        while self.command_queue:
            command = self.command_queue.pop(0)
            self.handle_command(command)
            self.last_command_time = now

    def handle_command(self, command: dict):
        try:
            cmd_type = command.get("command_type", "")
            cmd_id = command.get("command_id", "")
            
            if cmd_type == "reset":
                self.base_voltage = 550.0
                self.base_current = 8.0
                self.base_temp = 40.0
                print(f"[{self.device_id}] Device reset")
            elif cmd_type == "calibrate":
                self.base_voltage *= 1.02
                self.base_current *= 0.98
                print(f"[{self.device_id}] Device calibrated")
            elif cmd_type == "set_param":
                params = command.get("parameters", {})
                for param_name, param_value in params.items():
                    print(f"[{self.device_id}] Parameter {param_name} set to {param_value}")
            elif cmd_type == "shutdown":
                self.base_current = 0
                print(f"[{self.device_id}] Device shutdown")
            elif cmd_type == "startup":
                self.base_current = 8.0
                print(f"[{self.device_id}] Device startup")
            
            response = CommandResponse(
                command_id=cmd_id,
                device_id=self.device_id,
                success=True,
                message=f"Command {cmd_type} executed successfully"
            )
            
            result = self.client.publish(
                settings.MQTT_TOPIC_RESPONSE,
                response.model_dump_json(),
                qos=2
            )
            result.wait_for_publish(timeout=5)
            print(f"[{self.device_id}] Response sent for command {cmd_id}")
            
        except Exception as e:
            print(f"[{self.device_id}] Error handling command: {e}")

    def generate_data(self) -> PVStringData:
        hour = datetime.now().hour
        minute = datetime.now().minute
        
        day_start = 6
        day_end = 18
        
        if hour < day_start or hour >= day_end:
            day_factor = 0.05
        else:
            if hour < 12:
                day_factor = (hour - day_start + minute / 60) / 6
            else:
                day_factor = (day_end - hour - minute / 60) / 6
            day_factor = max(0, min(1, day_factor))
        
        weather_factor = self.weather_sim.get_irradiance_factor()
        effective_factor = day_factor * weather_factor
        
        voltage = self.base_voltage + random.uniform(-20, 20)
        if effective_factor < 0.1:
            voltage = random.uniform(50, 200)
        
        current = self.base_current * effective_factor + random.uniform(-0.5, 0.5)
        current = max(0, current)
        
        temp_ambient = 25 + 15 * day_factor + random.uniform(-3, 3)
        temp_heating = current * 2.5
        temperature = temp_ambient + temp_heating + random.uniform(-2, 2)
        
        if effective_factor > 0 and random.random() < 0.01:
            voltage *= random.uniform(0.3, 0.7)
            print(f"[{self.device_id}] Simulated cloud shadow effect")
        
        if random.random() < 0.005:
            current = 0
            print(f"[{self.device_id}] Simulated transient disconnect")
        
        return PVStringData(
            string_id=self.device_id,
            voltage=round(voltage, 2),
            current=round(current, 2),
            temperature=round(temperature, 1)
        )

    def connect(self):
        try:
            self.client.will_set(
                f"pv/status/{self.device_id}",
                json.dumps({
                    "device_id": self.device_id,
                    "status": "offline",
                    "timestamp": datetime.now().isoformat()
                }),
                qos=1,
                retain=True
            )
            self.client.connect(settings.MQTT_BROKER, settings.MQTT_PORT, 60)
            self.client.loop_start()
            self.running = True
            print(f"[{self.device_id}] Device started")
        except Exception as e:
            print(f"[{self.device_id}] Connection error: {e}")

    def disconnect(self):
        try:
            self.client.publish(
                f"pv/status/{self.device_id}",
                json.dumps({
                    "device_id": self.device_id,
                    "status": "offline",
                    "timestamp": datetime.now().isoformat()
                }),
                qos=1,
                retain=True
            )
        except:
            pass
        self.running = False
        self.client.loop_stop()
        self.client.disconnect()
        print(f"[{self.device_id}] Device stopped")

    def run(self, interval: float = 5.0):
        self.connect()
        try:
            while self.running:
                self.weather_sim.update_weather()
                self.process_commands()
                data = self.generate_data()
                result = self.client.publish(
                    settings.MQTT_TOPIC_DATA,
                    data.model_dump_json(),
                    qos=1
                )
                result.wait_for_publish(timeout=2)
                print(f"[{self.device_id}] [{self.weather_sim.current_weather}] "
                      f"V:{data.voltage}V I:{data.current}A T:{data.temperature}°C")
                time.sleep(interval)
        except KeyboardInterrupt:
            self.disconnect()


def run_multiple_simulators(device_ids: list, interval: float = 5.0):
    weather_sim = WeatherSimulator()
    simulators = [EdgeDeviceSimulator(did, weather_sim) for did in device_ids]
    
    for sim in simulators:
        sim.connect()
    
    try:
        while True:
            weather_sim.update_weather()
            for sim in simulators:
                sim.process_commands()
                data = sim.generate_data()
                sim.client.publish(
                    settings.MQTT_TOPIC_DATA,
                    data.model_dump_json(),
                    qos=1
                )
            print(f"[{datetime.now()}] Weather: {weather_sim.current_weather} "
                  f"({weather_sim.cloud_coverage:.0%} cloud), "
                  f"Batch data sent for {len(simulators)} devices")
            time.sleep(interval)
    except KeyboardInterrupt:
        for sim in simulators:
            sim.disconnect()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="PV Edge Device Simulator")
    parser.add_argument("--devices", nargs="+", 
                        default=["string-001", "string-002", "string-003", "string-004", "string-005", "string-006"],
                        help="List of device IDs to simulate")
    parser.add_argument("--interval", type=float, default=5.0,
                        help="Data sending interval in seconds")
    parser.add_argument("--single", action="store_true",
                        help="Run single device mode")
    
    args = parser.parse_args()
    
    if args.single and args.devices:
        sim = EdgeDeviceSimulator(args.devices[0])
        sim.run(args.interval)
    else:
        run_multiple_simulators(args.devices, args.interval)
