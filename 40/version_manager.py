import warnings

warnings.warn(
    "version_manager is deprecated. Use the 'version' package instead.",
    DeprecationWarning,
    stacklevel=2
)

from version import (
    FirmwareVersion,
    VersionStatus,
    VersionValidator,
    VersionComparator,
    VersionComparisonResult,
    VersionQuery,
    DeviceVersionReport,
    VersionReportManager,
)

__all__ = [
    "FirmwareVersion",
    "VersionStatus",
    "VersionValidator",
    "VersionComparator",
    "VersionComparisonResult",
    "VersionQuery",
    "DeviceVersionReport",
    "VersionReportManager",
]
