import numpy as np
from typing import Tuple, List, Dict, Any, Optional, Union
from dataclasses import dataclass, field
from enum import Enum

from utils import setup_logger

logger = setup_logger("data_validator")


class ValidationSeverity(Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class ValidationIssue:
    variable: str
    issue_type: str
    severity: ValidationSeverity
    message: str
    count: int = 0
    indices: Optional[List[int]] = None
    values: Optional[List[float]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "variable": self.variable,
            "issue_type": self.issue_type,
            "severity": self.severity.value,
            "message": self.message,
            "count": self.count,
            "sample_indices": self.indices[:10] if self.indices else None,
            "sample_values": self.values[:10] if self.values else None,
        }


@dataclass
class ValidationReport:
    variable: str
    total_points: int = 0
    valid_points: int = 0
    issues: List[ValidationIssue] = field(default_factory=list)
    statistics: Dict[str, float] = field(default_factory=dict)

    def is_valid(self, error_threshold: int = 0) -> bool:
        error_count = sum(1 for i in self.issues if i.severity in [ValidationSeverity.ERROR, ValidationSeverity.CRITICAL])
        return error_count <= error_threshold

    def to_dict(self) -> Dict[str, Any]:
        return {
            "variable": self.variable,
            "total_points": self.total_points,
            "valid_points": self.valid_points,
            "is_valid": self.is_valid(),
            "issues": [i.to_dict() for i in self.issues],
            "statistics": self.statistics,
        }


class OceanDataValidator:
    PHYSICAL_RANGES = {
        "temperature": {
            "valid_range": (-2.0, 40.0),
            "extreme_range": (-5.0, 50.0),
            "typical_profile_slope": 0.01,
        },
        "salinity": {
            "valid_range": (0.0, 42.0),
            "extreme_range": (0.0, 45.0),
            "typical_profile_slope": 0.0005,
        },
        "pressure": {
            "valid_range": (0.0, 12000.0),
            "extreme_range": (0.0, 15000.0),
        },
        "depth": {
            "valid_range": (0.0, 11000.0),
            "extreme_range": (0.0, 12000.0),
        },
        "conductivity": {
            "valid_range": (0.0, 10.0),
            "extreme_range": (0.0, 15.0),
        },
        "dissolved_oxygen": {
            "valid_range": (0.0, 15.0),
            "extreme_range": (0.0, 20.0),
        },
        "ph": {
            "valid_range": (6.0, 9.0),
            "extreme_range": (5.0, 10.0),
        },
    }

    TYPICAL_GRADIENTS = {
        "temperature": 0.05,
        "salinity": 0.01,
        "density": 0.005,
    }

    def __init__(self, strict_mode: bool = False):
        self.strict_mode = strict_mode

    def validate_profile(
        self,
        depths: np.ndarray,
        values: np.ndarray,
        variable: str = "temperature",
        station_id: str = "unknown"
    ) -> ValidationReport:
        report = ValidationReport(variable=variable)
        report.total_points = len(values)

        if len(values) == 0:
            report.issues.append(ValidationIssue(
                variable=variable,
                issue_type="empty_data",
                severity=ValidationSeverity.CRITICAL,
                message="No data points provided"
            ))
            return report

        nan_mask = np.isnan(values)
        nan_count = np.sum(nan_mask)

        if nan_count > 0:
            report.issues.append(ValidationIssue(
                variable=variable,
                issue_type="nan_values",
                severity=ValidationSeverity.WARNING,
                message=f"Found {nan_count} NaN values",
                count=int(nan_count),
                indices=list(np.where(nan_mask)[0]),
            ))

        valid_mask = ~nan_mask
        valid_values = values[valid_mask]
        valid_depths = depths[valid_mask] if depths is not None else np.array([])
        report.valid_points = len(valid_values)

        if len(valid_values) == 0:
            report.issues.append(ValidationIssue(
                variable=variable,
                issue_type="all_nan",
                severity=ValidationSeverity.CRITICAL,
                message="All values are NaN"
            ))
            return report

        if variable in self.PHYSICAL_RANGES:
            range_config = self.PHYSICAL_RANGES[variable]

            extreme_violations = (valid_values < range_config["extreme_range"][0]) | \
                                  (valid_values > range_config["extreme_range"][1])
            if np.any(extreme_violations):
                extreme_indices = np.where(extreme_violations)[0]
                report.issues.append(ValidationIssue(
                    variable=variable,
                    issue_type="extreme_physical_range",
                    severity=ValidationSeverity.CRITICAL,
                    message=f"Values outside extreme physical range {range_config['extreme_range']}",
                    count=int(np.sum(extreme_violations)),
                    indices=list(extreme_indices),
                    values=list(valid_values[extreme_violations]),
                ))

            valid_range_violations = (valid_values < range_config["valid_range"][0]) | \
                                      (valid_values > range_config["valid_range"][1])
            valid_range_violations = valid_range_violations & ~extreme_violations
            if np.any(valid_range_violations):
                violation_indices = np.where(valid_range_violations)[0]
                report.issues.append(ValidationIssue(
                    variable=variable,
                    issue_type="valid_range_violation",
                    severity=ValidationSeverity.WARNING,
                    message=f"Values outside typical valid range {range_config['valid_range']}",
                    count=int(np.sum(valid_range_violations)),
                    indices=list(violation_indices),
                    values=list(valid_values[valid_range_violations]),
                ))

        if len(valid_depths) > 3 and variable in self.TYPICAL_GRADIENTS:
            sort_indices = np.argsort(valid_depths)
            sorted_depths = valid_depths[sort_indices]
            sorted_values = valid_values[sort_indices]

            depth_diff = np.diff(sorted_depths)
            value_diff = np.abs(np.diff(sorted_values))

            non_zero_depth = depth_diff > 0
            if np.any(non_zero_depth):
                gradients = value_diff[non_zero_depth] / depth_diff[non_zero_depth]
                max_gradient = self.TYPICAL_GRADIENTS.get(variable, 0.1) * 10

                if np.any(gradients > max_gradient):
                    bad_indices = np.where(gradients > max_gradient)[0]
                    report.issues.append(ValidationIssue(
                        variable=variable,
                        issue_type="unusual_gradient",
                        severity=ValidationSeverity.WARNING,
                        message=f"Unusually large vertical gradient (> {max_gradient:.4f} per meter)",
                        count=int(np.sum(gradients > max_gradient)),
                        indices=list(bad_indices),
                        values=list(gradients[bad_indices]),
                    ))

        if len(valid_values) > 0:
            report.statistics = {
                "mean": float(np.mean(valid_values)),
                "std": float(np.std(valid_values)),
                "min": float(np.min(valid_values)),
                "max": float(np.max(valid_values)),
                "median": float(np.median(valid_values)),
                "nan_count": int(nan_count),
            }

        critical_count = sum(1 for i in report.issues if i.severity == ValidationSeverity.CRITICAL)
        error_count = sum(1 for i in report.issues if i.severity == ValidationSeverity.ERROR)
        warning_count = sum(1 for i in report.issues if i.severity == ValidationSeverity.WARNING)

        logger.debug(
            f"Validation for {station_id}/{variable}: "
            f"{critical_count} critical, {error_count} errors, {warning_count} warnings"
        )

        return report

    def validate_coordinates(
        self,
        longitudes: np.ndarray,
        latitudes: np.ndarray,
        station_id: str = "unknown"
    ) -> ValidationReport:
        report = ValidationReport(variable="coordinates")
        report.total_points = len(longitudes)

        lon_valid = (longitudes >= -180) & (longitudes <= 180) & ~np.isnan(longitudes)
        lat_valid = (latitudes >= -90) & (latitudes <= 90) & ~np.isnan(latitudes)

        invalid_lon = np.sum(~lon_valid)
        invalid_lat = np.sum(~lat_valid)

        if invalid_lon > 0:
            report.issues.append(ValidationIssue(
                variable="longitude",
                issue_type="invalid_longitude",
                severity=ValidationSeverity.ERROR,
                message=f"Found {invalid_lon} invalid longitude values",
                count=int(invalid_lon),
            ))

        if invalid_lat > 0:
            report.issues.append(ValidationIssue(
                variable="latitude",
                issue_type="invalid_latitude",
                severity=ValidationSeverity.ERROR,
                message=f"Found {invalid_lat} invalid latitude values",
                count=int(invalid_lat),
            ))

        if np.all(lon_valid) and np.all(lat_valid) and len(longitudes) > 1:
            lon_std = np.std(longitudes)
            lat_std = np.std(latitudes)

            if lon_std > 1.0 or lat_std > 1.0:
                report.issues.append(ValidationIssue(
                    variable="coordinates",
                    issue_type="large_spread",
                    severity=ValidationSeverity.WARNING,
                    message=f"Unusually large coordinate spread: lon_std={lon_std:.2f}, lat_std={lat_std:.2f}",
                ))

        report.valid_points = int(np.sum(lon_valid & lat_valid))
        return report

    def validate_station(
        self,
        observation: Any,
        detailed: bool = False
    ) -> Dict[str, ValidationReport]:
        reports = {}

        reports["coordinates"] = self.validate_coordinates(
            observation.longitude,
            observation.latitude,
            observation.station_id
        )

        for var_name in ["temperature", "salinity", "pressure", "dissolved_oxygen", "ph"]:
            values = getattr(observation, var_name, None)
            if values is not None:
                reports[var_name] = self.validate_profile(
                    observation.depth,
                    values,
                    var_name,
                    observation.station_id
                )

        return reports

    def summarize_reports(
        self,
        reports: Dict[str, ValidationReport]
    ) -> Dict[str, Any]:
        summary = {
            "total_issues": 0,
            "by_severity": {
                "critical": 0,
                "error": 0,
                "warning": 0,
                "info": 0,
            },
            "by_variable": {},
            "is_valid": True,
        }

        for var_name, report in reports.items():
            summary["by_variable"][var_name] = {
                "is_valid": report.is_valid(),
                "n_issues": len(report.issues),
                "valid_points": report.valid_points,
                "total_points": report.total_points,
            }

            for issue in report.issues:
                summary["total_issues"] += 1
                summary["by_severity"][issue.severity.value] += 1

                if issue.severity in [ValidationSeverity.ERROR, ValidationSeverity.CRITICAL]:
                    summary["is_valid"] = False

        return summary


class QualityControl:
    def __init__(self, strict_mode: bool = False):
        self.validator = OceanDataValidator(strict_mode=strict_mode)
        self.fix_count: Dict[str, int] = {}

    def auto_correct_profile(
        self,
        depths: np.ndarray,
        values: np.ndarray,
        variable: str = "temperature"
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        original_values = values.copy()
        corrections = {
            "nan_filled": 0,
            "outliers_corrected": 0,
            "range_corrected": 0,
        }

        nan_mask = np.isnan(values)
        if np.any(nan_mask):
            valid_indices = np.where(~nan_mask)[0]
            invalid_indices = np.where(nan_mask)[0]
            if len(valid_indices) > 1:
                values[nan_mask] = np.interp(
                    invalid_indices,
                    valid_indices,
                    values[~nan_mask]
                )
                corrections["nan_filled"] = int(np.sum(nan_mask))

        if variable in OceanDataValidator.PHYSICAL_RANGES:
            range_config = OceanDataValidator.PHYSICAL_RANGES[variable]
            valid_min, valid_max = range_config["valid_range"]

            out_of_range = (values < valid_min) | (values > valid_max)
            if np.any(out_of_range):
                values[values < valid_min] = valid_min
                values[values > valid_max] = valid_max
                corrections["range_corrected"] = int(np.sum(out_of_range))

        from scipy.ndimage import median_filter
        if len(values) > 5:
            filtered = median_filter(values, size=3)
            diff = np.abs(values - filtered)
            outlier_mask = diff > 3 * np.std(values - filtered)
            if np.any(outlier_mask):
                values[outlier_mask] = filtered[outlier_mask]
                corrections["outliers_corrected"] = int(np.sum(outlier_mask))

        return values, corrections

    def apply_qc_to_observation(
        self,
        observation: Any,
        auto_correct: bool = True
    ) -> Dict[str, Any]:
        reports = self.validator.validate_station(observation)
        summary = self.validator.summarize_reports(reports)

        qc_result = {
            "station_id": observation.station_id,
            "reports": {k: v.to_dict() for k, v in reports.items()},
            "summary": summary,
            "corrections": {},
        }

        if auto_correct and not summary["is_valid"]:
            for var_name in ["temperature", "salinity"]:
                if hasattr(observation, var_name):
                    values = getattr(observation, var_name)
                    corrected, corrections = self.auto_correct_profile(
                        observation.depth, values, var_name
                    )
                    setattr(observation, var_name, corrected)
                    qc_result["corrections"][var_name] = corrections

            logger.info(f"Applied QC corrections to station {observation.station_id}")

        return qc_result
