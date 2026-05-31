import numpy as np
import pandas as pd
from scipy import stats
from typing import Dict, List, Optional, Tuple, Union


class DataCleaner:

    @staticmethod
    def remove_duplicates(df: pd.DataFrame, subset: Optional[List[str]] = None) -> pd.DataFrame:
        return df.drop_duplicates(subset=subset, keep="first").reset_index(drop=True)

    @staticmethod
    def handle_missing(
        df: pd.DataFrame,
        strategy: str = "interpolate",
        columns: Optional[List[str]] = None,
        fill_value: Optional[float] = None,
    ) -> pd.DataFrame:
        result = df.copy()
        cols = columns or result.select_dtypes(include=[np.number]).columns.tolist()

        for col in cols:
            if col not in result.columns:
                continue
            if strategy == "drop":
                result = result.dropna(subset=[col])
            elif strategy == "fill" and fill_value is not None:
                result[col] = result[col].fillna(fill_value)
            elif strategy == "mean":
                result[col] = result[col].fillna(result[col].mean())
            elif strategy == "median":
                result[col] = result[col].fillna(result[col].median())
            elif strategy == "interpolate":
                result[col] = result[col].interpolate(method="linear", limit_direction="both")
            elif strategy == "forward":
                result[col] = result[col].ffill()

        return result.reset_index(drop=True)

    @staticmethod
    def detect_outliers_iqr(
        df: pd.DataFrame, columns: Optional[List[str]] = None, factor: float = 1.5
    ) -> Dict[str, pd.Series]:
        cols = columns or df.select_dtypes(include=[np.number]).columns.tolist()
        outlier_mask = {}
        for col in cols:
            if col not in df.columns:
                continue
            q1 = df[col].quantile(0.25)
            q3 = df[col].quantile(0.75)
            iqr = q3 - q1
            lower = q1 - factor * iqr
            upper = q3 + factor * iqr
            outlier_mask[col] = (df[col] < lower) | (df[col] > upper)
        return outlier_mask

    @staticmethod
    def detect_outliers_zscore(
        df: pd.DataFrame, columns: Optional[List[str]] = None, threshold: float = 3.0
    ) -> Dict[str, pd.Series]:
        cols = columns or df.select_dtypes(include=[np.number]).columns.tolist()
        outlier_mask = {}
        for col in cols:
            if col not in df.columns:
                continue
            z_scores = np.abs(stats.zscore(df[col].dropna()))
            mask = pd.Series(False, index=df.index)
            valid_idx = df[col].notna()
            mask[valid_idx] = z_scores > threshold
            outlier_mask[col] = mask
        return outlier_mask

    @staticmethod
    def remove_outliers(
        df: pd.DataFrame, columns: Optional[List[str]] = None, method: str = "iqr", **kwargs
    ) -> pd.DataFrame:
        cleaner = DataCleaner
        if method == "iqr":
            masks = cleaner.detect_outliers_iqr(df, columns, kwargs.get("factor", 1.5))
        else:
            masks = cleaner.detect_outliers_zscore(df, columns, kwargs.get("threshold", 3.0))

        combined_mask = pd.Series(False, index=df.index)
        for col_mask in masks.values():
            combined_mask = combined_mask | col_mask

        return df[~combined_mask].reset_index(drop=True)

    @staticmethod
    def clip_outliers(
        df: pd.DataFrame, columns: Optional[List[str]] = None, factor: float = 1.5
    ) -> pd.DataFrame:
        result = df.copy()
        cols = columns or result.select_dtypes(include=[np.number]).columns.tolist()
        for col in cols:
            if col not in result.columns:
                continue
            q1 = result[col].quantile(0.25)
            q3 = result[col].quantile(0.75)
            iqr = q3 - q1
            lower = q1 - factor * iqr
            upper = q3 + factor * iqr
            result[col] = result[col].clip(lower, upper)
        return result
