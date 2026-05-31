import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, Any, Tuple


class VersionStatus(Enum):
    UNKNOWN = "unknown"
    CURRENT = "current"
    OUTDATED = "outdated"
    NEWER = "newer"
    INCOMPATIBLE = "incompatible"
    CORRUPTED = "corrupted"


@dataclass
class FirmwareVersion:
    major: int = 0
    minor: int = 0
    patch: int = 0
    build: int = 0
    commit_hash: str = ""
    build_time: str = ""
    hardware: str = ""
    device_id: str = ""
    checksum_valid: Optional[bool] = None

    def __str__(self) -> str:
        base = f"{self.major}.{self.minor}.{self.patch}"
        if self.build:
            base += f".{self.build}"
        if self.commit_hash:
            base += f" ({self.commit_hash[:8]})"
        return base

    def to_tuple(self) -> Tuple[int, int, int, int]:
        return (self.major, self.minor, self.patch, self.build)

    def compare(self, other: "FirmwareVersion") -> int:
        if not isinstance(other, FirmwareVersion):
            return 1

        self_tuple = self.to_tuple()
        other_tuple = other.to_tuple()

        if self_tuple < other_tuple:
            return -1
        elif self_tuple > other_tuple:
            return 1
        return 0

    def __lt__(self, other: "FirmwareVersion") -> bool:
        return self.compare(other) < 0

    def __eq__(self, other: Any) -> bool:
        if not isinstance(other, FirmwareVersion):
            return False
        return self.compare(other) == 0

    def __gt__(self, other: "FirmwareVersion") -> bool:
        return self.compare(other) > 0

    def __hash__(self) -> int:
        return hash(self.to_tuple())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "version": str(self),
            "major": self.major,
            "minor": self.minor,
            "patch": self.patch,
            "build": self.build,
            "commit_hash": self.commit_hash,
            "build_time": self.build_time,
            "hardware": self.hardware,
            "device_id": self.device_id,
            "checksum_valid": self.checksum_valid,
        }

    @classmethod
    def from_string(cls, version_str: str) -> "FirmwareVersion":
        version = cls()
        if not version_str:
            return version

        try:
            version_str = str(version_str).strip()

            match = re.match(
                r"^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:\s*\(([0-9a-fA-F]+)\))?$",
                version_str
            )
            if match:
                groups = match.groups()
                version.major = int(groups[0]) if groups[0] else 0
                version.minor = int(groups[1]) if groups[1] else 0
                version.patch = int(groups[2]) if groups[2] else 0
                version.build = int(groups[3]) if groups[3] else 0
                version.commit_hash = groups[4] if groups[4] else ""
            else:
                parts = version_str.split(".")
                if len(parts) >= 1:
                    version.major = cls._safe_int(parts[0])
                if len(parts) >= 2:
                    version.minor = cls._safe_int(parts[1])
                if len(parts) >= 3:
                    patch_parts = parts[2].split()
                    version.patch = cls._safe_int(patch_parts[0])
                if len(parts) >= 4:
                    version.build = cls._safe_int(parts[3].split()[0])
        except Exception:
            pass
        return version

    @staticmethod
    def _safe_int(value: str, default: int = 0) -> int:
        try:
            return int(re.sub(r"[^\d]", "", value))
        except (ValueError, TypeError):
            return default

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "FirmwareVersion":
        if not data:
            return cls()

        from .validator import VersionValidator

        return cls(
            major=VersionValidator.sanitize_int(data.get("major", 0)),
            minor=VersionValidator.sanitize_int(data.get("minor", 0)),
            patch=VersionValidator.sanitize_int(data.get("patch", 0)),
            build=VersionValidator.sanitize_int(data.get("build", 0)),
            commit_hash=str(data.get("commit_hash", "")),
            build_time=str(data.get("build_time", "")),
            hardware=str(data.get("hardware", "")),
            device_id=str(data.get("device_id", "")),
            checksum_valid=data.get("checksum_valid"),
        )

    def is_valid(self) -> bool:
        return not (self.major == 0 and self.minor == 0 and self.patch == 0)
