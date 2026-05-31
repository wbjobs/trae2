import logging
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Tuple, Union, Callable
from pathlib import Path
from enum import Enum

import numpy as np
import pandas as pd
import xarray as xr

from .data_parser import ObservationDataParser, ParsedDataset

logger = logging.getLogger(__name__)


class AggregationMethod(Enum):
    MEAN = "mean"
    MEDIAN = "median"
    SUM = "sum"
    MIN = "min"
    MAX = "max"
    STD = "std"
    VARIANCE = "variance"
    PERCENTILE = "percentile"
    WEIGHTED_MEAN = "weighted_mean"
    EXPONENTIAL = "exponential"


class CombineMethod(Enum):
    CONCAT = "concat"
    MERGE = "merge"
    INTERPOLATE = "interpolate"
    ALIGN = "align"


@dataclass
class PeriodConfig:
    name: str
    start_time: pd.Timestamp
    end_time: pd.Timestamp
    weight: float = 1.0
    data: Optional[ParsedDataset] = None


@dataclass
class MultiPeriodConfig:
    combine_method: CombineMethod = CombineMethod.MERGE
    aggregation_method: AggregationMethod = AggregationMethod.MEAN
    percentile: int = 50
    exponential_alpha: float = 0.3
    fill_method: str = "time"
    enable_parallel: bool = True
    chunk_size: int = 10000


class MultiPeriodProcessor:
    def __init__(self, config: Optional[MultiPeriodConfig] = None, **kwargs):
        self.config = config or MultiPeriodConfig(**kwargs)
        self.periods: List[PeriodConfig] = []
        self._combined_data: Optional[xr.Dataset] = None

    def add_period(
        self,
        name: str,
        start_time: Union[str, pd.Timestamp],
        end_time: Union[str, pd.Timestamp],
        data: Optional[Union[str, Path, ParsedDataset]] = None,
        weight: float = 1.0,
    ) -> "MultiPeriodProcessor":
        period = PeriodConfig(
            name=name,
            start_time=pd.Timestamp(start_time),
            end_time=pd.Timestamp(end_time),
            weight=weight,
        )

        if data is not None:
            if isinstance(data, (str, Path)):
                parser = ObservationDataParser()
                period.data = parser.parse(data)
            else:
                period.data = data

        self.periods.append(period)
        logger.info(f"Added period: {name} ({period.start_time} to {period.end_time})")
        return self

    def load_period_data(
        self,
        period_name: str,
        data_path: Union[str, Path],
    ) -> "MultiPeriodProcessor":
        for period in self.periods:
            if period.name == period_name:
                parser = ObservationDataParser()
                period.data = parser.parse(data_path)
                logger.info(f"Loaded data for period: {period_name}")
                return self

        raise ValueError(f"Period not found: {period_name}")

    def _filter_by_time(self, df: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
        mask = (df["timestamp"] >= start) & (df["timestamp"] <= end)
        return df[mask].copy()

    def _aggregate_variable(
        self,
        values: np.ndarray,
        weights: Optional[np.ndarray] = None,
    ) -> float:
        method = self.config.aggregation_method

        if method == AggregationMethod.MEAN:
            return np.nanmean(values)
        elif method == AggregationMethod.MEDIAN:
            return np.nanmedian(values)
        elif method == AggregationMethod.SUM:
            return np.nansum(values)
        elif method == AggregationMethod.MIN:
            return np.nanmin(values)
        elif method == AggregationMethod.MAX:
            return np.nanmax(values)
        elif method == AggregationMethod.STD:
            return np.nanstd(values)
        elif method == AggregationMethod.VARIANCE:
            return np.nanvar(values)
        elif method == AggregationMethod.PERCENTILE:
            return np.nanpercentile(values, self.config.percentile)
        elif method == AggregationMethod.WEIGHTED_MEAN and weights is not None:
            valid_mask = ~np.isnan(values)
            if valid_mask.sum() > 0:
                return np.average(values[valid_mask], weights=weights[valid_mask])
            return np.nan
        elif method == AggregationMethod.EXPONENTIAL:
            valid_mask = ~np.isnan(values)
            if valid_mask.sum() > 0:
                sorted_idx = np.argsort(-np.arange(len(values)))
                exp_weights = self.config.exponential_alpha * (1 - self.config.exponential_alpha) ** np.arange(len(values))
                exp_weights = exp_weights[sorted_idx][valid_mask]
                return np.average(values[valid_mask], weights=exp_weights)
            return np.nan
        else:
            return np.nanmean(values)

    def combine_periods(
        self,
        variables: Optional[List[str]] = None,
        method: Optional[Union[CombineMethod, str]] = None,
        combine_method: Optional[CombineMethod] = None,
    ) -> xr.Dataset:
        combine_method = combine_method or method or self.config.combine_method
        if isinstance(combine_method, str):
            combine_method = CombineMethod(combine_method)

        if not self.periods:
            raise ValueError("No periods added")

        all_datasets = []
        for period in self.periods:
            if period.data is None:
                logger.warning(f"Skipping period {period.name}: no data")
                continue

            if isinstance(period.data, xr.Dataset):
                ds = period.data.copy()
                time_dim = self._find_time_dim(ds)
                if time_dim:
                    start_ns = period.start_time.value
                    end_ns = period.end_time.value
                    times = ds[time_dim].values.astype('datetime64[ns]').astype('int64')
                    time_mask = (times >= start_ns) & (times <= end_ns)
                    if time_mask.any():
                        ds = ds.isel({time_dim: time_mask})
                    else:
                        logger.warning(f"No data in period {period.name}")
                        continue
                all_datasets.append(ds)
                continue

            df = period.data.to_dataframe()
            df_filtered = self._filter_by_time(df, period.start_time, period.end_time)

            if df_filtered.empty:
                logger.warning(f"No data in period {period.name}")
                continue

            if variables is None:
                variables = period.data.variables

            station_groups = df_filtered.groupby("station_id")

            aggregated_data = []
            for station_id, station_df in station_groups:
                station_row = {
                    "station_id": station_id,
                    "latitude": station_df["latitude"].iloc[0],
                    "longitude": station_df["longitude"].iloc[0],
                    "altitude": station_df["altitude"].iloc[0],
                    "period": period.name,
                    "period_start": period.start_time,
                    "period_end": period.end_time,
                    "weight": period.weight,
                    "observation_count": len(station_df),
                }

                for var in variables:
                    if var in station_df.columns:
                        values = station_df[var].values
                        weights = np.full_like(values, period.weight)
                        station_row[var] = self._aggregate_variable(values, weights)

                aggregated_data.append(station_row)

            if aggregated_data:
                agg_df = pd.DataFrame(aggregated_data)
                all_datasets.append(agg_df)

        if not all_datasets:
            raise ValueError("No valid data to combine")

        combined_df = pd.concat(all_datasets, ignore_index=True)

        if combine_method == CombineMethod.CONCAT:
            result_ds = combined_df.set_index(["period", "station_id"]).to_xarray()
        elif combine_method == CombineMethod.MERGE:
            pivot_df = combined_df.pivot(
                index=["station_id", "latitude", "longitude", "altitude"],
                columns="period",
                values=variables,
            )
            result_ds = xr.Dataset.from_dataframe(pivot_df)
        elif combine_method == CombineMethod.ALIGN:
            result_ds = self._align_periods(combined_df, variables)
        elif combine_method == CombineMethod.INTERPOLATE:
            result_ds = self._interpolate_periods(combined_df, variables)
        else:
            result_ds = combined_df.set_index(["period", "station_id"]).to_xarray()

        self._combined_data = result_ds
        logger.info(f"Combined {len(self.periods)} periods with {combine_method.value} method")
        return result_ds

    def _align_periods(
        self,
        df: pd.DataFrame,
        variables: List[str],
    ) -> xr.Dataset:
        all_stations = df["station_id"].unique()
        all_periods = df["period"].unique()

        result_data = []
        for station_id in all_stations:
            station_df = df[df["station_id"] == station_id]
            base_row = {
                "station_id": station_id,
                "latitude": station_df["latitude"].iloc[0],
                "longitude": station_df["longitude"].iloc[0],
                "altitude": station_df["altitude"].iloc[0],
            }

            for period in all_periods:
                period_df = station_df[station_df["period"] == period]
                if not period_df.empty:
                    for var in variables:
                        base_row[f"{var}_{period}"] = period_df[var].iloc[0]
                else:
                    for var in variables:
                        base_row[f"{var}_{period}"] = np.nan

            result_data.append(base_row)

        result_df = pd.DataFrame(result_data)
        return result_df.set_index("station_id").to_xarray()

    def _interpolate_periods(
        self,
        df: pd.DataFrame,
        variables: List[str],
    ) -> xr.Dataset:
        periods_sorted = sorted(self.periods, key=lambda p: p.start_time)
        period_times = [(p.start_time + (p.end_time - p.start_time) / 2) for p in periods_sorted]
        period_names = [p.name for p in periods_sorted]

        all_stations = df["station_id"].unique()

        result_data = []
        for station_id in all_stations:
            station_df = df[df["station_id"] == station_id]
            base_row = {
                "station_id": station_id,
                "latitude": station_df["latitude"].iloc[0],
                "longitude": station_df["longitude"].iloc[0],
                "altitude": station_df["altitude"].iloc[0],
            }

            for var in variables:
                values = []
                for p in periods_sorted:
                    p_df = station_df[station_df["period"] == p.name]
                    if not p_df.empty:
                        values.append(p_df[var].iloc[0])
                    else:
                        values.append(np.nan)

                values_arr = np.array(values, dtype=float)
                valid_mask = ~np.isnan(values_arr)

                if valid_mask.sum() >= 2:
                    from scipy import interpolate

                    times_num = np.array([t.timestamp() for t in period_times])
                    f = interpolate.interp1d(
                        times_num[valid_mask],
                        values_arr[valid_mask],
                        kind="linear",
                        fill_value="extrapolate",
                    )
                    interpolated = f(times_num)

                    for i, p_name in enumerate(period_names):
                        base_row[f"{var}_{p_name}"] = interpolated[i]
                else:
                    for i, p_name in enumerate(period_names):
                        base_row[f"{var}_{p_name}"] = values_arr[i]

            result_data.append(base_row)

        result_df = pd.DataFrame(result_data)
        return result_df.set_index("station_id").to_xarray()

    def compute_weighted_composite(
        self,
        variables: Optional[List[str]] = None,
        output_suffix: str = "composite",
    ) -> xr.Dataset:
        if self._combined_data is None:
            self.combine_periods(variables)

        if variables is None:
            variables = [
                v for v in self._combined_data.data_vars
                if not v.startswith("weight") and not v.startswith("observation_count")
            ]

        weights = np.array([p.weight for p in self.periods])
        weights = weights / weights.sum()

        composite_ds = self._combined_data.copy()

        for var in variables:
            var_data = []
            for i, period in enumerate(self.periods):
                if period.name in self._combined_data:
                    period_var = f"{var}_{period.name}"
                    if period_var in self._combined_data.data_vars:
                        var_data.append(self._combined_data[period_var].values * weights[i])

            if var_data:
                composite = np.sum(var_data, axis=0)
                composite_ds[f"{var}_{output_suffix}"] = (
                    self._combined_data[next(iter(self._combined_data.data_vars))].dims,
                    composite,
                )

        logger.info(f"Computed weighted composite for {len(variables)} variables")
        return composite_ds

    def compute_trend(
        self,
        variable: str,
        dim: str = "period",
    ) -> xr.Dataset:
        if self._combined_data is None:
            self.combine_periods()

        ds = self._combined_data

        period_names = [p.name for p in self.periods]
        x_values = np.arange(len(period_names))

        trend_ds = ds.copy()

        var_columns = [f"{variable}_{p}" for p in period_names]
        var_columns = [c for c in var_columns if c in ds.data_vars]

        if len(var_columns) >= 2:
            y_values = np.stack([ds[c].values for c in var_columns], axis=0)

            slopes = np.zeros(y_values.shape[1:])
            intercepts = np.zeros(y_values.shape[1:])
            r_values = np.zeros(y_values.shape[1:])

            for idx in np.ndindex(y_values.shape[1:]):
                y_slice = y_values[(slice(None),) + idx]
                valid_mask = ~np.isnan(y_slice)
                if valid_mask.sum() >= 2:
                    slope, intercept, r_value, _, _ = np.polyfit(
                        x_values[valid_mask], y_slice[valid_mask], 1, full=False
                    )
                    slopes[idx] = slope
                    intercepts[idx] = intercept
                    r_values[idx] = r_value

            sample_da = ds[var_columns[0]]
            trend_ds[f"{variable}_trend_slope"] = (sample_da.dims, slopes)
            trend_ds[f"{variable}_trend_intercept"] = (sample_da.dims, intercepts)
            trend_ds[f"{variable}_trend_r"] = (sample_da.dims, r_values)

        logger.info(f"Computed trend for {variable} across {len(period_names)} periods")
        return trend_ds

    def compute_anomaly(
        self,
        variable: str,
        reference_period: Optional[str] = None,
    ) -> xr.Dataset:
        if self._combined_data is None:
            self.combine_periods()

        ds = self._combined_data

        if reference_period is None:
            reference_period = self.periods[0].name

        ref_var = f"{variable}_{reference_period}"
        if ref_var not in ds.data_vars:
            raise ValueError(f"Reference period variable not found: {ref_var}")

        ref_values = ds[ref_var].values

        anomaly_ds = ds.copy()

        for period in self.periods:
            period_var = f"{variable}_{period.name}"
            if period_var in ds.data_vars:
                anomaly = ds[period_var].values - ref_values
                anomaly_pct = (anomaly / (ref_values + 1e-10)) * 100
                anomaly_ds[f"{variable}_{period.name}_anomaly"] = ds[period_var].dims, anomaly
                anomaly_ds[f"{variable}_{period.name}_anomaly_pct"] = ds[period_var].dims, anomaly_pct

        logger.info(f"Computed anomalies for {variable} relative to {reference_period}")
        return anomaly_ds

    def batch_process(
        self,
        input_dir: Union[str, Path],
        file_pattern: str = "*.csv",
        period_prefix: str = "period_",
    ) -> xr.Dataset:
        input_dir = Path(input_dir)
        files = sorted(input_dir.glob(file_pattern))

        if not files:
            raise FileNotFoundError(f"No files matching {file_pattern} in {input_dir}")

        for i, file in enumerate(files):
            parser = ObservationDataParser()
            data = parser.parse(file)

            timestamps = data.to_dataframe()["timestamp"]
            self.add_period(
                name=f"{period_prefix}{i+1}",
                start_time=timestamps.min(),
                end_time=timestamps.max(),
                data=data,
            )

        return self.combine_periods()

    def get_combined_data(self) -> xr.Dataset:
        if self._combined_data is None:
            raise ValueError("No combined data available, run combine_periods first")
        return self._combined_data

    @staticmethod
    def available_aggregation_methods() -> List[str]:
        return [m.value for m in AggregationMethod]

    @staticmethod
    def available_combine_methods() -> List[str]:
        return [m.value for m in CombineMethod]
