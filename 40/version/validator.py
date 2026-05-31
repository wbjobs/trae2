import hashlib
from typing import Tuple, List, Any

from .version import FirmwareVersion


class VersionValidator:
    @staticmethod
    def sanitize_int(value: Any, default: int = 0) -> int:
        try:
            result = int(value)
            return max(0, min(result, 999999))
        except (ValueError, TypeError):
            return default

    @staticmethod
    def validate_version(version: FirmwareVersion) -> Tuple[bool, List[str]]:
        errors = []

        if version.major < 0 or version.major > 999999:
            errors.append(f"Invalid major version: {version.major}")
        if version.minor < 0 or version.minor > 999999:
            errors.append(f"Invalid minor version: {version.minor}")
        if version.patch < 0 or version.patch > 999999:
            errors.append(f"Invalid patch version: {version.patch}")
        if version.build < 0 or version.build > 99999999:
            errors.append(f"Invalid build number: {version.build}")

        return len(errors) == 0, errors

    @staticmethod
    def calculate_checksum(data: bytes) -> str:
        return hashlib.sha256(data).hexdigest()

    @staticmethod
    def verify_checksum(data: bytes, expected_checksum: str) -> bool:
        actual = VersionValidator.calculate_checksum(data)
        return actual.lower() == expected_checksum.lower()
