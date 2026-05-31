from dataclasses import dataclass
from typing import Optional

from .version import FirmwareVersion, VersionStatus


@dataclass
class VersionComparisonResult:
    device_id: str
    device_name: str
    old_version: FirmwareVersion
    new_version: FirmwareVersion
    status: VersionStatus
    version_change: str = ""
    is_compatible: bool = True
    change_magnitude: int = 0

    def to_dict(self):
        return {
            "device_id": self.device_id,
            "device_name": self.device_name,
            "old_version": self.old_version.to_dict(),
            "new_version": self.new_version.to_dict(),
            "status": self.status.value,
            "version_change": self.version_change,
            "is_compatible": self.is_compatible,
            "change_magnitude": self.change_magnitude,
        }


class VersionComparator:
    @staticmethod
    def compare_versions(
        old_version: FirmwareVersion, new_version: FirmwareVersion
    ) -> VersionStatus:
        if not old_version.is_valid() or not new_version.is_valid():
            return VersionStatus.UNKNOWN

        cmp = old_version.compare(new_version)
        if cmp < 0:
            return VersionStatus.OUTDATED
        elif cmp > 0:
            return VersionStatus.NEWER
        else:
            return VersionStatus.CURRENT

    @staticmethod
    def compare_device_reports(
        report_1, report_2
    ) -> VersionComparisonResult:
        old_version = report_1.current_version
        new_version = report_2.current_version

        status = VersionComparator.compare_versions(old_version, new_version)
        change = VersionComparator._get_version_change_string(old_version, new_version)
        magnitude = VersionComparator._get_change_magnitude(old_version, new_version)
        compatible = VersionComparator._check_compatibility(old_version, new_version)

        return VersionComparisonResult(
            device_id=report_1.device_id,
            device_name=report_1.device_name,
            old_version=old_version,
            new_version=new_version,
            status=status,
            version_change=change,
            is_compatible=compatible,
            change_magnitude=magnitude,
        )

    @staticmethod
    def _get_version_change_string(old: FirmwareVersion, new: FirmwareVersion) -> str:
        if old.major != new.major:
            return "major"
        elif old.minor != new.minor:
            return "minor"
        elif old.patch != new.patch:
            return "patch"
        elif old.build != new.build:
            return "build"
        return "none"

    @staticmethod
    def _get_change_magnitude(old: FirmwareVersion, new: FirmwareVersion) -> int:
        magnitude = 0
        if old.major != new.major:
            magnitude += 1000
        if old.minor != new.minor:
            magnitude += 100
        if old.patch != new.patch:
            magnitude += 10
        if old.build != new.build:
            magnitude += 1
        return magnitude

    @staticmethod
    def _check_compatibility(old: FirmwareVersion, new: FirmwareVersion) -> bool:
        if not old.is_valid() or not new.is_valid():
            return False
        return old.major == new.major

    @staticmethod
    def is_hardware_compatible(hw1: str, hw2: str) -> bool:
        if not hw1 or not hw2:
            return True
        return hw1.lower() == hw2.lower()
