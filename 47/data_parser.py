import numpy as np
import pandas as pd
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any, Union
from dataclasses import dataclass, field
from scipy.ndimage import median_filter, gaussian_filter1d
from scipy import stats

from config import DenoiseConfig
from utils import setup_logger, calculate_statistics, validate_coordinates

logger = setup_logger("data_parser")


@dataclass
class OceanObservation:
    station_id: str
    time: np.ndarray
    longitude: np.ndarray
    latitude: np.ndarray
    depth: np.ndarray
    temperature: np.ndarray
    salinity: np.ndarray
    pressure: Optional[np.ndarray] = None
    conductivity: Optional[np.ndarray] = None
    dissolved_oxygen: Optional[np.ndarray] = None
    ph: Optional[np.ndarray] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __len__(self) -> int:
        return len(self.depth)

    def validate(self) -> Tuple[bool, List[str]]:
        errors = []

        if not validate_coordinates(self.longitude, self.latitude):
            errors.append("Invalid longitude/latitude coordinates out of valid range")

        if len(self.depth) != len(self.temperature) != len(self.salinity):
            errors.append(f"Array length mismatch: depth={len(self.depth)}, temp={len(self.temperature)}, sal={len(self.salinity)}")

        if np.any(self.depth < 0):
            errors.append("Negative depth values found")

        n_depths = len(self.depth)
        valid_depths = self.depth[~np.isnan(self.depth)]
        if len(valid_depths) == 0:
            errors.append("All depth values are NaN")

        valid_temps = self.temperature[~np.isnan(self.temperature)]
        if len(valid_temps) == 0:
            errors.append("All temperature values are NaN")
        elif len(valid_temps) < n_depths * 0.5:
            errors.append(f"Too many NaN values in temperature: {n_depths - len(valid_temps)}/{n_depths}")

        valid_sals = self.salinity[~np.isnan(self.salinity)]
        if len(valid_sals) == 0:
            errors.append("All salinity values are NaN")
        elif len(valid_sals) < n_depths * 0.5:
            errors.append(f"Too many NaN values in salinity: {n_depths - len(valid_sals)}/{n_depths}")

        is_valid = len(errors) == 0
        if not is_valid and len(errors) > 0:
            logger.warning(f"Station {self.station_id} validation issues: {errors[:3]}")

        return is_valid, errors

    def data_quality_report(self) -> Dict[str, Any]:
        report = {
            "station_id": self.station_id,
            "n_points": len(self),
            "nan_count": {
                "temperature": int(np.sum(np.isnan(self.temperature))),
                "salinity": int(np.sum(np.isnan(self.salinity))),
                "depth": int(np.sum(np.isnan(self.depth))),
            },
            "depth_range": [float(np.nanmin(self.depth)), float(np.nanmax(self.depth))],
            "temperature_stats": calculate_statistics(self.temperature[~np.isnan(self.temperature)]),
            "salinity_stats": calculate_statistics(self.salinity[~np.isnan(self.salinity)]),
            "longitude": float(np.nanmean(self.longitude)),
            "latitude": float(np.nanmean(self.latitude)),
        }

        if self.pressure is not None:
            report["nan_count"]["pressure"] = int(np.sum(np.isnan(self.pressure)))
        if self.conductivity is not None:
            report["nan_count"]["conductivity"] = int(np.sum(np.isnan(self.conductivity)))

        return report

    def summary(self) -> Dict[str, Any]:
        return self.data_quality_report()


class DataDenoiser:
    PHYSICAL_RANGES = {
        "temperature": (-2.0, 40.0),
        "salinity": (0.0, 42.0),
        "pressure": (0.0, 12000.0),
        "depth": (0.0, 11000.0),
        "conductivity": (0.0, 10.0),
        "dissolved_oxygen": (0.0, 15.0),
        "ph": (6.0, 9.0),
    }

    def __init__(self, config: DenoiseConfig):
        self.config = config
        self.outlier_report: Dict[str, int] = {}

    def validate_physical_range(
        self,
        data: np.ndarray,
        variable: str = "temperature"
    ) -> Tuple[np.ndarray, int]:
        if variable not in self.PHYSICAL_RANGES:
            return data, 0

        min_val, max_val = self.PHYSICAL_RANGES[variable]
        valid_mask = (data >= min_val) & (data <= max_val) & ~np.isnan(data)
        n_invalid = np.sum(~valid_mask)

        if n_invalid > 0:
            cleaned = data.copy()
            valid_indices = np.where(valid_mask)[0]
            invalid_indices = np.where(~valid_mask)[0]
            if len(valid_indices) > 1:
                cleaned[~valid_mask] = np.interp(
                    invalid_indices,
                    valid_indices,
                    data[valid_mask]
                )
            else:
                cleaned[~valid_mask] = np.nanmean(data[valid_mask]) if len(valid_indices) > 0 else np.nan
            return cleaned, n_invalid
        return data, 0

    def remove_outliers_iqr(
        self,
        data: np.ndarray,
        iqr_factor: float = 1.5
    ) -> Tuple[np.ndarray, int]:
        valid_data = data[~np.isnan(data)]
        if len(valid_data) < 4:
            return data, 0

        q1 = np.percentile(valid_data, 25)
        q3 = np.percentile(valid_data, 75)
        iqr = q3 - q1
        lower_bound = q1 - iqr_factor * iqr
        upper_bound = q3 + iqr_factor * iqr

        mask = (data >= lower_bound) & (data <= upper_bound) | np.isnan(data)
        n_outliers = np.sum(~mask)

        if n_outliers > 0:
            cleaned = data.copy()
            valid_indices = np.where(mask)[0]
            invalid_indices = np.where(~mask)[0]
            if len(valid_indices) > 1:
                cleaned[~mask] = np.interp(
                    invalid_indices,
                    valid_indices,
                    data[mask]
                )
            return cleaned, n_outliers
        return data, 0

    def remove_outliers_zscore(self, data: np.ndarray) -> Tuple[np.ndarray, int]:
        valid_data = data[~np.isnan(data)]
        if len(valid_data) < 4:
            return data, 0

        z_scores = np.abs(stats.zscore(valid_data))
        threshold = self.config.outlier_threshold

        mean_val = np.mean(valid_data)
        std_val = np.std(valid_data)
        lower_bound = mean_val - threshold * std_val
        upper_bound = mean_val + threshold * std_val

        mask = (data >= lower_bound) & (data <= upper_bound) | np.isnan(data)
        n_outliers = np.sum(~mask)

        if n_outliers > 0:
            cleaned = data.copy()
            valid_indices = np.where(mask)[0]
            invalid_indices = np.where(~mask)[0]
            if len(valid_indices) > 1:
                cleaned[~mask] = np.interp(
                    invalid_indices,
                    valid_indices,
                    data[mask]
                )
            return cleaned, n_outliers
        return data, 0

    def remove_spatial_outliers(
        self,
        depths: np.ndarray,
        values: np.ndarray,
        window_size: int = 5
    ) -> Tuple[np.ndarray, int]:
        if len(values) < window_size * 2:
            return values, 0

        n_outliers = 0
        cleaned = values.copy()
        half_window = window_size // 2

        for i in range(len(values)):
            if np.isnan(values[i]):
                continue

            start = max(0, i - half_window)
            end = min(len(values), i + half_window + 1)
            window = values[start:end]
            window_valid = window[~np.isnan(window)]

            if len(window_valid) < 3:
                continue

            median = np.median(window_valid)
            mad = np.median(np.abs(window_valid - median))
            if mad == 0:
                continue

            modified_z = 0.6745 * (values[i] - median) / mad
            if abs(modified_z) > self.config.outlier_threshold:
                cleaned[i] = median
                n_outliers += 1

        return cleaned, n_outliers

    def apply_median_filter(self, data: np.ndarray) -> np.ndarray:
        valid_mask = ~np.isnan(data)
        result = data.copy()
        if np.any(valid_mask):
            filtered = median_filter(data, size=self.config.window_size)
            result[valid_mask] = filtered[valid_mask]
        return result

    def apply_gaussian_filter(self, data: np.ndarray) -> np.ndarray:
        valid_mask = ~np.isnan(data)
        result = data.copy()
        if np.any(valid_mask):
            filtered = gaussian_filter1d(data, sigma=self.config.sigma)
            result[valid_mask] = filtered[valid_mask]
        return result

    def denoise(
        self,
        data: np.ndarray,
        variable: str = "temperature",
        depths: Optional[np.ndarray] = None
    ) -> Tuple[np.ndarray, Dict[str, int]]:
        report = {
            "physical_range_outliers": 0,
            "statistical_outliers": 0,
            "spatial_outliers": 0,
            "total_valid": 0
        }

        if np.sum(~np.isnan(data)) == 0:
            logger.warning("All data values are NaN")
            return data, report

        data, n_physical = self.validate_physical_range(data, variable)
        report["physical_range_outliers"] = n_physical

        if self.config.remove_outliers:
            data, n_stat = self.remove_outliers_iqr(data)
            report["statistical_outliers"] = n_stat

            if depths is not None and len(depths) == len(data):
                data, n_spatial = self.remove_spatial_outliers(depths, data)
                report["spatial_outliers"] = n_spatial

        if self.config.method == "median":
            data = self.apply_median_filter(data)
        elif self.config.method == "gaussian":
            data = self.apply_gaussian_filter(data)

        report["total_valid"] = int(np.sum(~np.isnan(data)))
        self.outlier_report[variable] = report

        if sum(report.values()) > 0:
            logger.debug(f"Denoising {variable}: {report}")

        return data, report


class OceanDataParser:
    SUPPORTED_FORMATS = [".csv", ".txt", ".nc", ".json"]

    def __init__(self, denoise_config: Optional[DenoiseConfig] = None):
        self.denoiser = DataDenoiser(denoise_config) if denoise_config else None
        self.observations: List[OceanObservation] = []

    def parse_file(self, file_path: Union[str, Path]) -> List[OceanObservation]:
        file_path = Path(file_path)
        suffix = file_path.suffix.lower()

        if suffix == ".csv":
            return self._parse_csv(file_path)
        elif suffix == ".txt":
            return self._parse_txt(file_path)
        elif suffix == ".nc":
            return self._parse_netcdf(file_path)
        elif suffix == ".json":
            return self._parse_json(file_path)
        else:
            raise ValueError(f"Unsupported file format: {suffix}")

    def _parse_csv(self, file_path: Path) -> List[OceanObservation]:
        logger.info(f"Parsing CSV file: {file_path}")
        df = pd.read_csv(file_path)
        return self._parse_dataframe(df)

    def _parse_txt(self, file_path: Path) -> List[OceanObservation]:
        logger.info(f"Parsing TXT file: {file_path}")
        df = pd.read_csv(file_path, sep=None, engine="python")
        return self._parse_dataframe(df)

    def _parse_netcdf(self, file_path: Path) -> List[OceanObservation]:
        logger.info(f"Parsing NetCDF file: {file_path}")
        try:
            import xarray as xr
            ds = xr.open_dataset(file_path)
            df = ds.to_dataframe().reset_index()
            return self._parse_dataframe(df)
        except ImportError:
            raise ImportError("xarray is required for NetCDF parsing")

    def _parse_json(self, file_path: Path) -> List[OceanObservation]:
        import json
        logger.info(f"Parsing JSON file: {file_path}")
        with open(file_path, "r") as f:
            data = json.load(f)

        observations = []
        for station_data in data.get("stations", []):
            obs = OceanObservation(
                station_id=station_data.get("station_id", "unknown"),
                time=np.array(station_data.get("time", [])),
                longitude=np.array(station_data.get("longitude", [])),
                latitude=np.array(station_data.get("latitude", [])),
                depth=np.array(station_data.get("depth", [])),
                temperature=np.array(station_data.get("temperature", [])),
                salinity=np.array(station_data.get("salinity", [])),
                pressure=np.array(station_data.get("pressure", [])),
                conductivity=np.array(station_data.get("conductivity", [])),
                metadata=station_data.get("metadata", {})
            )
            is_valid, _ = obs.validate()
            if is_valid:
                observations.append(obs)
        return observations

    def _parse_dataframe(self, df: pd.DataFrame) -> List[OceanObservation]:
        column_mapping = {
            "station_id": ["station_id", "station", "id", "cast"],
            "time": ["time", "date", "datetime", "timestamp"],
            "longitude": ["longitude", "lon", "long"],
            "latitude": ["latitude", "lat"],
            "depth": ["depth", "pres", "pressure", "z"],
            "temperature": ["temperature", "temp", "t"],
            "salinity": ["salinity", "sal", "s", "psal"],
            "pressure": ["pressure", "pres", "p"],
            "conductivity": ["conductivity", "cond", "c"],
            "dissolved_oxygen": ["dissolved_oxygen", "do", "oxygen"],
            "ph": ["ph", "ph_value"]
        }

        def find_column(target_names: List[str]) -> Optional[str]:
            for target in target_names:
                for col in df.columns:
                    if col.lower() == target.lower():
                        return col
            return None

        resolved_cols = {
            key: find_column(names) for key, names in column_mapping.items()
        }

        required_cols = ["depth", "temperature", "salinity"]
        for col in required_cols:
            if resolved_cols[col] is None:
                raise ValueError(f"Required column '{col}' not found in data")

        observations = []
        station_col = resolved_cols["station_id"]

        if station_col is not None:
            grouped = df.groupby(station_col)
        else:
            grouped = [(f"station_{i}", df) for i in range(1)]

        for station_id, group in grouped:
            n = len(group)
            obs = OceanObservation(
                station_id=str(station_id),
                time=pd.to_datetime(group[resolved_cols["time"]]).values if resolved_cols["time"] else np.full(n, np.datetime64("NaT")),
                longitude=group[resolved_cols["longitude"]].values if resolved_cols["longitude"] else np.array([0.0] * n),
                latitude=group[resolved_cols["latitude"]].values if resolved_cols["latitude"] else np.array([0.0] * n),
                depth=group[resolved_cols["depth"]].values,
                temperature=group[resolved_cols["temperature"]].values,
                salinity=group[resolved_cols["salinity"]].values,
                pressure=group[resolved_cols["pressure"]].values if resolved_cols["pressure"] else None,
                conductivity=group[resolved_cols["conductivity"]].values if resolved_cols["conductivity"] else None,
                dissolved_oxygen=group[resolved_cols["dissolved_oxygen"]].values if resolved_cols["dissolved_oxygen"] else None,
                ph=group[resolved_cols["ph"]].values if resolved_cols["ph"] else None,
                metadata={"source": "dataframe", "n_rows": n}
            )
            is_valid, _ = obs.validate()
            if is_valid:
                observations.append(obs)

        return observations

    def denoise_observations(self) -> Dict[str, Dict[str, int]]:
        if self.denoiser is None:
            logger.warning("No denoiser configured, skipping denoising")
            return {}

        logger.info("Denoising observations...")
        total_report: Dict[str, Dict[str, int]] = {}

        for obs_idx, obs in enumerate(self.observations):
            obs.temperature, temp_report = self.denoiser.denoise(
                obs.temperature, "temperature", obs.depth
            )
            obs.salinity, sal_report = self.denoiser.denoise(
                obs.salinity, "salinity", obs.depth
            )

            station_key = f"{obs.station_id}_{obs_idx}"
            total_report[station_key] = {
                "temperature": temp_report,
                "salinity": sal_report
            }

            if obs.dissolved_oxygen is not None:
                obs.dissolved_oxygen, do_report = self.denoiser.denoise(
                    obs.dissolved_oxygen, "dissolved_oxygen", obs.depth
                )
                total_report[station_key]["dissolved_oxygen"] = do_report

            if obs.pressure is not None:
                obs.pressure, pres_report = self.denoiser.denoise(
                    obs.pressure, "pressure", obs.depth
                )
                total_report[station_key]["pressure"] = pres_report

        total_physical = sum(
            station_data.get(var, {}).get("physical_range_outliers", 0)
            for station_data in total_report.values()
            for var in station_data
        )
        total_spatial = sum(
            station_data.get(var, {}).get("spatial_outliers", 0)
            for station_data in total_report.values()
            for var in station_data
        )

        logger.info(
            f"Denoising complete: {total_physical} physical outliers removed, "
            f"{total_spatial} spatial outliers corrected across {len(self.observations)} stations"
        )

        return total_report

    def parse_directory(self, dir_path: Union[str, Path]) -> List[OceanObservation]:
        dir_path = Path(dir_path)
        all_obs = []
        for file_path in dir_path.iterdir():
            if file_path.suffix.lower() in self.SUPPORTED_FORMATS:
                obs = self.parse_file(file_path)
                all_obs.extend(obs)
        self.observations = all_obs
        logger.info(f"Loaded {len(all_obs)} observations from {dir_path}")
        return all_obs

    def merge_observations(self) -> OceanObservation:
        if not self.observations:
            raise ValueError("No observations to merge")

        all_data = {
            "station_id": "merged",
            "time": np.concatenate([obs.time for obs in self.observations]),
            "longitude": np.concatenate([obs.longitude for obs in self.observations]),
            "latitude": np.concatenate([obs.latitude for obs in self.observations]),
            "depth": np.concatenate([obs.depth for obs in self.observations]),
            "temperature": np.concatenate([obs.temperature for obs in self.observations]),
            "salinity": np.concatenate([obs.salinity for obs in self.observations]),
        }

        optional_fields = ["pressure", "conductivity", "dissolved_oxygen", "ph"]
        for field in optional_fields:
            values = [getattr(obs, field) for obs in self.observations if getattr(obs, field) is not None]
            if values:
                all_data[field] = np.concatenate(values)
            else:
                all_data[field] = None

        all_data["metadata"] = {
            "n_stations": len(self.observations),
            "stations": [obs.station_id for obs in self.observations]
        }

        return OceanObservation(**all_data)

    def to_dataframe(self) -> pd.DataFrame:
        if not self.observations:
            return pd.DataFrame()

        dfs = []
        for obs in self.observations:
            df = pd.DataFrame({
                "station_id": obs.station_id,
                "time": obs.time,
                "longitude": obs.longitude,
                "latitude": obs.latitude,
                "depth": obs.depth,
                "temperature": obs.temperature,
                "salinity": obs.salinity,
            })
            if obs.pressure is not None:
                df["pressure"] = obs.pressure
            if obs.conductivity is not None:
                df["conductivity"] = obs.conductivity
            if obs.dissolved_oxygen is not None:
                df["dissolved_oxygen"] = obs.dissolved_oxygen
            if obs.ph is not None:
                df["ph"] = obs.ph
            dfs.append(df)

        return pd.concat(dfs, ignore_index=True)
