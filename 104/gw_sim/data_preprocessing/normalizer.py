import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Union


class Normalizer:

    @staticmethod
    def minmax(
        df: pd.DataFrame,
        columns: Optional[List[str]] = None,
        feature_range: Tuple[float, float] = (0.0, 1.0),
    ) -> Tuple[pd.DataFrame, Dict[str, Dict[str, float]]]:
        result = df.copy()
        cols = columns or result.select_dtypes(include=[np.number]).columns.tolist()
        params = {}
        a, b = feature_range

        for col in cols:
            if col not in result.columns:
                continue
            col_min = result[col].min()
            col_max = result[col].max()
            denom = col_max - col_min if col_max != col_min else 1.0
            result[col] = a + (result[col] - col_min) * (b - a) / denom
            params[col] = {"min": float(col_min), "max": float(col_max), "range": feature_range}

        return result, params

    @staticmethod
    def zscore(
        df: pd.DataFrame, columns: Optional[List[str]] = None
    ) -> Tuple[pd.DataFrame, Dict[str, Dict[str, float]]]:
        result = df.copy()
        cols = columns or result.select_dtypes(include=[np.number]).columns.tolist()
        params = {}

        for col in cols:
            if col not in result.columns:
                continue
            mean = result[col].mean()
            std = result[col].std()
            denom = std if std != 0 else 1.0
            result[col] = (result[col] - mean) / denom
            params[col] = {"mean": float(mean), "std": float(std)}

        return result, params

    @staticmethod
    def decimal_scaling(
        df: pd.DataFrame, columns: Optional[List[str]] = None
    ) -> Tuple[pd.DataFrame, Dict[str, Dict[str, int]]]:
        result = df.copy()
        cols = columns or result.select_dtypes(include=[np.number]).columns.tolist()
        params = {}

        for col in cols:
            if col not in result.columns:
                continue
            max_abs = result[col].abs().max()
            j = 0
            while 10**j <= max_abs:
                j += 1
            result[col] = result[col] / (10**j)
            params[col] = {"decimal_power": j}

        return result, params

    @staticmethod
    def robust(
        df: pd.DataFrame, columns: Optional[List[str]] = None
    ) -> Tuple[pd.DataFrame, Dict[str, Dict[str, float]]]:
        result = df.copy()
        cols = columns or result.select_dtypes(include=[np.number]).columns.tolist()
        params = {}

        for col in cols:
            if col not in result.columns:
                continue
            median = result[col].median()
            q1 = result[col].quantile(0.25)
            q3 = result[col].quantile(0.75)
            iqr = q3 - q1
            denom = iqr if iqr != 0 else 1.0
            result[col] = (result[col] - median) / denom
            params[col] = {"median": float(median), "iqr": float(iqr)}

        return result, params

    @staticmethod
    def inverse_minmax(
        data: pd.DataFrame, params: Dict[str, Dict[str, float]]
    ) -> pd.DataFrame:
        result = data.copy()
        for col, p in params.items():
            if col not in result.columns:
                continue
            a, b = p["range"]
            col_min = p["min"]
            col_max = p["max"]
            denom = col_max - col_min if col_max != col_min else 1.0
            scale_factor = denom / (b - a) if (b - a) != 0 else 1.0
            result[col] = col_min + (result[col] - a) * scale_factor
        return result

    @staticmethod
    def inverse_zscore(
        data: pd.DataFrame, params: Dict[str, Dict[str, float]]
    ) -> pd.DataFrame:
        result = data.copy()
        for col, p in params.items():
            if col not in result.columns:
                continue
            mean = p["mean"]
            std = p["std"]
            result[col] = result[col] * std + mean
        return result

    @staticmethod
    def inverse_decimal_scaling(
        data: pd.DataFrame, params: Dict[str, Dict[str, int]]
    ) -> pd.DataFrame:
        result = data.copy()
        for col, p in params.items():
            if col not in result.columns:
                continue
            power = p["decimal_power"]
            result[col] = result[col] * (10**power)
        return result

    @staticmethod
    def inverse_robust(
        data: pd.DataFrame, params: Dict[str, Dict[str, float]]
    ) -> pd.DataFrame:
        result = data.copy()
        for col, p in params.items():
            if col not in result.columns:
                continue
            median = p["median"]
            iqr = p["iqr"]
            result[col] = result[col] * iqr + median
        return result

    @staticmethod
    def inverse(
        data: pd.DataFrame,
        method: str,
        params: Dict,
    ) -> pd.DataFrame:
        dispatch = {
            "minmax": Normalizer.inverse_minmax,
            "zscore": Normalizer.inverse_zscore,
            "decimal": Normalizer.inverse_decimal_scaling,
            "robust": Normalizer.inverse_robust,
        }
        fn = dispatch.get(method)
        if fn is None:
            raise ValueError(f"Unknown inverse method: {method}, available: {list(dispatch.keys())}")
        return fn(data, params)

    @staticmethod
    def normalize(
        df: pd.DataFrame,
        method: str = "minmax",
        columns: Optional[List[str]] = None,
        **kwargs,
    ) -> Tuple[pd.DataFrame, Dict]:
        dispatch = {
            "minmax": Normalizer.minmax,
            "zscore": Normalizer.zscore,
            "decimal": Normalizer.decimal_scaling,
            "robust": Normalizer.robust,
        }
        fn = dispatch.get(method)
        if fn is None:
            raise ValueError(f"Unknown normalization method: {method}, available: {list(dispatch.keys())}")
        if method == "minmax":
            return fn(df, columns, kwargs.get("feature_range", (0.0, 1.0)))
        return fn(df, columns)


HYDRO_UNIT_CONVERSIONS = {
    "water_level": {
        "m_to_cm": 100.0,
        "cm_to_m": 0.01,
        "m_to_ft": 3.28084,
        "ft_to_m": 0.3048,
    },
    "conductivity": {
        "mS/cm_to_S/m": 100.0,
        "S/m_to_mS/cm": 0.01,
        "uS/cm_to_S/m": 0.0001,
        "S/m_to_uS/cm": 10000.0,
    },
    "permeability": {
        "m2_to_md": 1.01325e15,
        "md_to_m2": 9.869233e-16,
    },
    "velocity": {
        "m/s_to_m/d": 86400.0,
        "m/d_to_m/s": 1.0 / 86400.0,
        "m/s_to_cm/s": 100.0,
        "cm/s_to_m/s": 0.01,
    },
    "recharge": {
        "m/d_to_mm/yr": 365000.0,
        "mm/yr_to_m/d": 1.0 / 365000.0,
    },
}


class HydroUnitConverter:

    @staticmethod
    def convert(
        df: pd.DataFrame,
        column: str,
        conversion_type: str,
        from_unit: str,
        to_unit: str,
    ) -> pd.DataFrame:
        result = df.copy()
        if column not in result.columns:
            raise ValueError(f"Column '{column}' not found in DataFrame")

        conv_key = f"{from_unit}_to_{to_unit}"
        if conversion_type not in HYDRO_UNIT_CONVERSIONS:
            raise ValueError(f"Unknown conversion type: {conversion_type}")

        factor = HYDRO_UNIT_CONVERSIONS[conversion_type].get(conv_key)
        if factor is None:
            raise ValueError(f"Conversion '{conv_key}' not available for {conversion_type}")

        result[column] = result[column] * factor
        return result

    @staticmethod
    def batch_convert(
        df: pd.DataFrame,
        conversions: List[Dict[str, str]],
    ) -> pd.DataFrame:
        result = df.copy()
        for conv in conversions:
            result = HydroUnitConverter.convert(
                result,
                column=conv["column"],
                conversion_type=conv["type"],
                from_unit=conv["from"],
                to_unit=conv["to"],
            )
        return result

    @staticmethod
    def get_available_conversions(conversion_type: Optional[str] = None) -> Dict:
        if conversion_type:
            return HYDRO_UNIT_CONVERSIONS.get(conversion_type, {})
        return HYDRO_UNIT_CONVERSIONS
