import pandas as pd
import numpy as np
from typing import Dict, List, Optional
from .cleaner import DataCleaner
from .normalizer import Normalizer, HydroUnitConverter


class PreprocessingPipeline:

    def __init__(
        self,
        missing_strategy: str = "interpolate",
        outlier_method: str = "iqr",
        outlier_action: str = "clip",
        normalization_method: str = "minmax",
        normalization_columns: Optional[List[str]] = None,
        duplicate_subset: Optional[List[str]] = None,
        unit_conversions: Optional[List[Dict[str, str]]] = None,
    ):
        self.missing_strategy = missing_strategy
        self.outlier_method = outlier_method
        self.outlier_action = outlier_action
        self.normalization_method = normalization_method
        self.normalization_columns = normalization_columns
        self.duplicate_subset = duplicate_subset
        self.unit_conversions = unit_conversions or []
        self.norm_params: Optional[Dict] = None
        self._steps: List[str] = []

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        result = df.copy()
        self._steps = []

        result = DataCleaner.remove_duplicates(result, subset=self.duplicate_subset)
        self._steps.append("dedup")

        result = DataCleaner.handle_missing(result, strategy=self.missing_strategy)
        self._steps.append("missing_handling")

        if self.unit_conversions:
            result = HydroUnitConverter.batch_convert(result, self.unit_conversions)
            self._steps.append("unit_conversion")

        if self.outlier_action == "clip":
            result = DataCleaner.clip_outliers(result)
            self._steps.append("outlier_clip")
        elif self.outlier_action == "remove":
            result = DataCleaner.remove_outliers(result, method=self.outlier_method)
            self._steps.append("outlier_remove")

        result, self.norm_params = Normalizer.normalize(
            result, method=self.normalization_method, columns=self.normalization_columns
        )
        self._steps.append("normalization")

        return result

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        if self.norm_params is None:
            raise RuntimeError("Pipeline not fitted. Call fit_transform first.")
        result = df.copy()
        result = DataCleaner.handle_missing(result, strategy=self.missing_strategy)
        if self.unit_conversions:
            result = HydroUnitConverter.batch_convert(result, self.unit_conversions)
        result = DataCleaner.clip_outliers(result)
        result, _ = Normalizer.normalize(
            result, method=self.normalization_method, columns=self.normalization_columns
        )
        return result

    def inverse_normalize(self, df: pd.DataFrame) -> pd.DataFrame:
        if self.norm_params is None:
            raise RuntimeError("Pipeline not fitted. Call fit_transform first.")
        return Normalizer.inverse(df, self.normalization_method, self.norm_params)

    def get_pipeline_info(self) -> Dict:
        return {
            "steps": self._steps,
            "normalization_method": self.normalization_method,
            "normalization_params": self.norm_params,
            "missing_strategy": self.missing_strategy,
            "outlier_method": self.outlier_method,
            "outlier_action": self.outlier_action,
        }


def load_hydrology_data(
    filepath: str,
    time_col: str = "timestamp",
    delimiter: str = ",",
    encoding: str = "utf-8",
) -> pd.DataFrame:
    ext = filepath.lower().split(".")[-1]
    if ext in ("xlsx", "xls"):
        df = pd.read_excel(filepath)
    elif ext == "csv":
        df = pd.read_csv(filepath, delimiter=delimiter, encoding=encoding)
    else:
        raise ValueError(f"Unsupported file format: {ext}")

    if time_col in df.columns:
        df[time_col] = pd.to_datetime(df[time_col], errors="coerce")
        df = df.sort_values(time_col).reset_index(drop=True)

    return df


def validate_hydrology_columns(
    df: pd.DataFrame,
    required: Optional[List[str]] = None,
) -> List[str]:
    issues = []
    if required is None:
        required = ["timestamp", "well_id", "water_level"]
    for col in required:
        if col not in df.columns:
            issues.append(f"Missing required column: {col}")
    if "timestamp" in df.columns:
        null_ts = df["timestamp"].isna().sum()
        if null_ts > 0:
            issues.append(f"Timestamp column has {null_ts} null values")
    if "water_level" in df.columns:
        if df["water_level"].notna().sum() == 0:
            issues.append("water_level column has no valid data")
    return issues
