import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

from .version import FirmwareVersion, VersionStatus
from .comparator import VersionComparisonResult


@dataclass
class DeviceVersionReport:
    device_id: str
    device_name: str
    current_version: FirmwareVersion
    hardware: str = ""
    last_checked: datetime = field(default_factory=datetime.now)
    checksum: str = ""
    status: VersionStatus = VersionStatus.UNKNOWN

    def to_dict(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "device_name": self.device_name,
            "hardware": self.hardware,
            "version": self.current_version.to_dict(),
            "last_checked": self.last_checked.isoformat(),
            "checksum": self.checksum,
            "status": self.status.value,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DeviceVersionReport":
        return cls(
            device_id=data.get("device_id", ""),
            device_name=data.get("device_name", ""),
            hardware=data.get("hardware", ""),
            current_version=FirmwareVersion.from_dict(data.get("version", {})),
            last_checked=datetime.fromisoformat(data.get("last_checked", datetime.now().isoformat())),
            checksum=data.get("checksum", ""),
            status=VersionStatus(data.get("status", "unknown")),
        )


class VersionReportManager:
    def __init__(self, storage_dir: Optional[str] = None):
        self.storage_dir = Path(storage_dir) if storage_dir else Path.home() / ".fw-manager" / "reports"
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._reports_file = self.storage_dir / "version_reports.json"
        self._reports: Dict[str, DeviceVersionReport] = {}
        self._load()

    def _load(self):
        if self._reports_file.exists():
            try:
                with open(self._reports_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                for report_data in data.get("reports", []):
                    report = DeviceVersionReport.from_dict(report_data)
                    self._reports[report.device_id] = report
            except Exception:
                pass

    def _save(self):
        try:
            with open(self._reports_file, "w", encoding="utf-8") as f:
                json.dump(
                    {"reports": [r.to_dict() for r in self._reports.values()]},
                    f,
                    indent=2,
                    ensure_ascii=False,
                )
        except Exception:
            pass

    def add_report(self, report: DeviceVersionReport):
        self._reports[report.device_id] = report
        self._save()

    def get_report(self, device_id: str) -> Optional[DeviceVersionReport]:
        return self._reports.get(device_id)

    def list_reports(self) -> List[DeviceVersionReport]:
        return list(self._reports.values())

    def compare_with_target(
        self, device_id: str, target_version: FirmwareVersion
    ) -> Optional[VersionComparisonResult]:
        report = self._reports.get(device_id)
        if not report:
            return None

        current = report.current_version
        cmp = current.compare(target_version)

        if cmp < 0:
            status = VersionStatus.OUTDATED
        elif cmp > 0:
            status = VersionStatus.NEWER
        else:
            status = VersionStatus.CURRENT

        return VersionComparisonResult(
            device_id=device_id,
            device_name=report.device_name,
            old_version=current,
            new_version=target_version,
            status=status,
        )

    def get_outdated_devices(
        self, target_version: FirmwareVersion
    ) -> List[DeviceVersionReport]:
        outdated = []
        for report in self._reports.values():
            if report.current_version.is_valid() and report.current_version < target_version:
                outdated.append(report)
        return outdated

    def get_current_devices(
        self, target_version: FirmwareVersion
    ) -> List[DeviceVersionReport]:
        current = []
        for report in self._reports.values():
            if report.current_version.is_valid() and report.current_version == target_version:
                current.append(report)
        return current

    def generate_comparison_report(
        self, target_version: FirmwareVersion
    ) -> Dict[str, Any]:
        total = len(self._reports)
        outdated = self.get_outdated_devices(target_version)
        current = self.get_current_devices(target_version)
        unknown = total - len(outdated) - len(current)

        return {
            "generated_at": datetime.now().isoformat(),
            "target_version": target_version.to_dict(),
            "statistics": {
                "total_devices": total,
                "outdated": len(outdated),
                "current": len(current),
                "unknown": unknown,
                "update_percentage": round((len(outdated) / total * 100), 2) if total > 0 else 0,
            },
            "outdated_devices": [r.to_dict() for r in outdated],
            "current_devices": [r.to_dict() for r in current],
            "unknown_devices": [
                r.to_dict()
                for r in self._reports.values()
                if r not in outdated and r not in current
            ],
        }
