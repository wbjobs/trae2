import json
import yaml
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple
import uuid

from device_comms import DeviceInfo, DeviceType


@dataclass
class DeviceGroup:
    group_id: str
    name: str
    description: str = ""
    devices: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "group_id": self.group_id,
            "name": self.name,
            "description": self.description,
            "devices": self.devices,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DeviceGroup":
        return cls(
            group_id=data["group_id"],
            name=data["name"],
            description=data.get("description", ""),
            devices=data.get("devices", []),
            created_at=datetime.fromisoformat(data.get("created_at", datetime.now().isoformat())),
            updated_at=datetime.fromisoformat(data.get("updated_at", datetime.now().isoformat())),
            metadata=data.get("metadata", {}),
        )


@dataclass
class DeviceCatalog:
    devices: Dict[str, DeviceInfo] = field(default_factory=dict)

    def add_device(self, device: DeviceInfo) -> bool:
        if device.device_id in self.devices:
            return False
        self.devices[device.device_id] = device
        return True

    def remove_device(self, device_id: str) -> bool:
        if device_id in self.devices:
            del self.devices[device_id]
            return True
        return False

    def get_device(self, device_id: str) -> Optional[DeviceInfo]:
        return self.devices.get(device_id)

    def list_devices(self, device_type: Optional[DeviceType] = None) -> List[DeviceInfo]:
        if device_type is None:
            return list(self.devices.values())
        return [d for d in self.devices.values() if d.device_type == device_type]

    def to_dict(self) -> Dict[str, Any]:
        return {
            device_id: {
                "device_id": d.device_id,
                "device_type": d.device_type.value,
                "connection": d.connection,
                "name": d.name,
                "port": d.port,
                "baudrate": d.baudrate,
                "timeout": d.timeout,
                "metadata": d.metadata,
            }
            for device_id, d in self.devices.items()
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DeviceCatalog":
        catalog = cls()
        for device_id, d in data.items():
            device_info = DeviceInfo(
                device_id=device_id,
                device_type=DeviceType(d.get("device_type", "serial")),
                connection=d.get("connection", ""),
                name=d.get("name", ""),
                port=d.get("port"),
                baudrate=d.get("baudrate", 115200),
                timeout=d.get("timeout", 10),
                metadata=d.get("metadata", {}),
            )
            catalog.devices[device_id] = device_info
        return catalog


class GroupManager:
    def __init__(self, storage_dir: Optional[str] = None):
        self.storage_dir = Path(storage_dir) if storage_dir else Path.home() / ".fw-manager" / "groups"
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._groups_file = self.storage_dir / "groups.json"
        self._catalog_file = self.storage_dir / "devices.json"
        self._groups: Dict[str, DeviceGroup] = {}
        self._catalog = DeviceCatalog()
        self._load()

    def _load(self):
        if self._groups_file.exists():
            try:
                with open(self._groups_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                for group_data in data.get("groups", []):
                    group = DeviceGroup.from_dict(group_data)
                    self._groups[group.group_id] = group
            except Exception:
                pass

        if self._catalog_file.exists():
            try:
                with open(self._catalog_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._catalog = DeviceCatalog.from_dict(data)
            except Exception:
                pass

    def _save(self):
        try:
            with open(self._groups_file, "w", encoding="utf-8") as f:
                json.dump(
                    {"groups": [g.to_dict() for g in self._groups.values()]},
                    f,
                    indent=2,
                    ensure_ascii=False,
                )
        except Exception:
            pass

        try:
            with open(self._catalog_file, "w", encoding="utf-8") as f:
                json.dump(self._catalog.to_dict(), f, indent=2, ensure_ascii=False)
        except Exception:
            pass

    def create_group(self, name: str, description: str = "", devices: Optional[List[str]] = None) -> DeviceGroup:
        group_id = str(uuid.uuid4())[:8]
        group = DeviceGroup(
            group_id=group_id,
            name=name,
            description=description,
            devices=devices or [],
        )
        self._groups[group_id] = group
        self._save()
        return group

    def delete_group(self, group_id: str) -> bool:
        if group_id in self._groups:
            del self._groups[group_id]
            self._save()
            return True
        return False

    def update_group(self, group_id: str, name: Optional[str] = None, description: Optional[str] = None) -> bool:
        if group_id not in self._groups:
            return False
        group = self._groups[group_id]
        if name is not None:
            group.name = name
        if description is not None:
            group.description = description
        group.updated_at = datetime.now()
        self._save()
        return True

    def get_group(self, group_id: str) -> Optional[DeviceGroup]:
        return self._groups.get(group_id)

    def list_groups(self) -> List[DeviceGroup]:
        return sorted(self._groups.values(), key=lambda g: g.name)

    def add_device_to_group(self, group_id: str, device_id: str) -> bool:
        group = self._groups.get(group_id)
        if not group:
            return False
        if device_id not in group.devices:
            group.devices.append(device_id)
            group.updated_at = datetime.now()
            self._save()
        return True

    def remove_device_from_group(self, group_id: str, device_id: str) -> bool:
        group = self._groups.get(group_id)
        if not group or device_id not in group.devices:
            return False
        group.devices.remove(device_id)
        group.updated_at = datetime.now()
        self._save()
        return True

    def get_group_devices(self, group_id: str) -> List[DeviceInfo]:
        group = self._groups.get(group_id)
        if not group:
            return []
        devices = []
        for device_id in group.devices:
            device = self._catalog.get_device(device_id)
            if device:
                devices.append(device)
        return devices

    def add_to_catalog(self, device: DeviceInfo) -> bool:
        result = self._catalog.add_device(device)
        if result:
            self._save()
        return result

    def remove_from_catalog(self, device_id: str) -> bool:
        for group in self._groups.values():
            if device_id in group.devices:
                group.devices.remove(device_id)
        result = self._catalog.remove_device(device_id)
        if result:
            self._save()
        return result

    def get_from_catalog(self, device_id: str) -> Optional[DeviceInfo]:
        return self._catalog.get_device(device_id)

    def list_catalog(self, device_type: Optional[DeviceType] = None) -> List[DeviceInfo]:
        return self._catalog.list_devices(device_type)

    def import_devices_from_file(self, file_path: str, group_id: Optional[str] = None) -> Tuple[int, List[str]]:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        devices_data = []
        if path.suffix in (".yaml", ".yml"):
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                if isinstance(data, dict) and "devices" in data:
                    devices_data = data["devices"]
                elif isinstance(data, list):
                    devices_data = data
        elif path.suffix == ".json":
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "devices" in data:
                    devices_data = data["devices"]
                elif isinstance(data, list):
                    devices_data = data
        else:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        parts = line.split()
                        devices_data.append({"connection": parts[0], "name": parts[1] if len(parts) > 1 else ""})

        added = []
        for d in devices_data:
            connection = d.get("connection", "")
            if not connection:
                continue

            device_type = DeviceType(d.get("device_type", "serial"))
            if ":" in connection and device_type == DeviceType.SERIAL:
                if ":" in connection:
                    device_type = DeviceType.NETWORK

            device_id = d.get("device_id")
            if not device_id:
                if device_type == DeviceType.NETWORK and ":" in connection:
                    host, port_str = connection.rsplit(":", 1)
                    try:
                        port = int(port_str)
                        device_id = f"net_{host}_{port}"
                    except ValueError:
                        device_id = f"net_{connection}"
                else:
                    device_id = f"serial_{connection}"

            device_info = DeviceInfo(
                device_id=device_id,
                device_type=device_type,
                connection=connection,
                name=d.get("name", connection),
                port=d.get("port"),
                baudrate=d.get("baudrate", 115200),
                timeout=d.get("timeout", 10),
                metadata=d.get("metadata", {}),
            )

            if device_type == DeviceType.NETWORK and device_info.port is None and ":" in connection:
                _, port_str = connection.rsplit(":", 1)
                try:
                    device_info.port = int(port_str)
                except ValueError:
                    pass

            if self.add_to_catalog(device_info):
                added.append(device_id)
                if group_id:
                    self.add_device_to_group(group_id, device_id)

        return len(added), added

    def export_devices_to_file(self, file_path: str, group_id: Optional[str] = None):
        devices = []
        if group_id:
            devices = self.get_group_devices(group_id)
        else:
            devices = self.list_catalog()

        data = [
            {
                "device_id": d.device_id,
                "device_type": d.device_type.value,
                "connection": d.connection,
                "name": d.name,
                "port": d.port,
                "baudrate": d.baudrate,
                "timeout": d.timeout,
                "metadata": d.metadata,
            }
            for d in devices
        ]

        path = Path(file_path)
        with open(path, "w", encoding="utf-8") as f:
            if path.suffix in (".yaml", ".yml"):
                yaml.safe_dump({"devices": data}, f, default_flow_style=False, allow_unicode=True)
            elif path.suffix == ".json":
                json.dump({"devices": data}, f, indent=2, ensure_ascii=False)
            else:
                for d in data:
                    conn = d["connection"]
                    if d.get("port"):
                        conn = f"{conn}:{d['port']}"
                    f.write(f"{conn} {d['name']}\n")
