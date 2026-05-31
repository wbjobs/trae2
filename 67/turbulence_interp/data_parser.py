import os
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Tuple, Union
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr
from scipy import stats

logger = logging.getLogger(__name__)


@dataclass
class ObservationRecord:
    station_id: str
    latitude: float
    longitude: float
    altitude: float
    timestamp: pd.Timestamp
    variables: Dict[str, float] = field(default_factory=dict)
    quality_flag: int = 0


@dataclass
class ParsedDataset:
    records: List[ObservationRecord]
    timestamps: pd.DatetimeIndex
    stations: pd.DataFrame
    variables: List[str]
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dataframe(self) -> pd.DataFrame:
        data = []
        for rec in self.records:
            row = {
                "station_id": rec.station_id,
                "latitude": rec.latitude,
                "longitude": rec.longitude,
                "altitude": rec.altitude,
                "timestamp": rec.timestamp,
                "quality_flag": rec.quality_flag,
            }
            row.update(rec.variables)
            data.append(row)
        return pd.DataFrame(data)

    def to_xarray(self) -> xr.Dataset:
        df = self.to_dataframe()
        return df.set_index(["station_id", "timestamp"]).to_xarray()


class ObservationDataParser:
    SUPPORTED_FORMATS = {".csv", ".nc", ".h5", ".hdf5", ".txt", ".dat"}

    PHYSICAL_RANGES = {
        "turbulence_intensity": (0.0, 10.0),
        "wind_speed": (0.0, 75.0),
        "wind_direction": (0.0, 360.0),
        "temperature": (-90.0, 60.0),
        "pressure": (870.0, 1085.0),
        "humidity": (0.0, 100.0),
        "visibility": (0.0, 100.0),
        "precipitation": (0.0, 500.0),
    }

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.data: Optional[ParsedDataset] = None
        self._custom_ranges: Dict[str, Tuple[float, float]] = self.config.get("physical_ranges", {})

    def parse(self, input_path: Union[str, Path], format: Optional[str] = None) -> ParsedDataset:
        input_path = Path(input_path)
        
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")

        if format is None:
            format = input_path.suffix.lower()

        if format not in self.SUPPORTED_FORMATS:
            raise ValueError(f"Unsupported format: {format}")

        logger.info(f"Parsing {input_path} as {format} format...")
        
        if format == ".csv" or format == ".txt" or format == ".dat":
            self.data = self._parse_csv(input_path)
        elif format == ".nc":
            self.data = self._parse_netcdf(input_path)
        elif format in {".h5", ".hdf5"}:
            self.data = self._parse_hdf5(input_path)

        logger.info(f"Parsed {len(self.data.records)} records from {input_path}")
        return self.data

    def parse_directory(self, directory: Union[str, Path], pattern: str = "*.csv") -> ParsedDataset:
        directory = Path(directory)
        files = sorted(directory.glob(pattern))
        
        if not files:
            raise FileNotFoundError(f"No files matching {pattern} found in {directory}")

        all_records: List[ObservationRecord] = []
        for file in files:
            logger.info(f"Parsing {file}...")
            parsed = self.parse(file)
            all_records.extend(parsed.records)

        timestamps = pd.DatetimeIndex(sorted({rec.timestamp for rec in all_records}))
        stations = self._extract_stations(all_records)
        variables = sorted({var for rec in all_records for var in rec.variables.keys()})

        self.data = ParsedDataset(
            records=all_records,
            timestamps=timestamps,
            stations=stations,
            variables=variables,
        )
        return self.data

    def _parse_csv(self, file_path: Path) -> ParsedDataset:
        df = pd.read_csv(file_path, **self.config.get("csv_options", {}))
        
        required_cols = ["station_id", "latitude", "longitude", "timestamp"]
        missing = [col for col in required_cols if col not in df.columns]
        if missing:
            raise ValueError(f"Missing required columns: {missing}")

        if "altitude" not in df.columns:
            df["altitude"] = 0.0

        df["timestamp"] = pd.to_datetime(df["timestamp"])
        
        variable_cols = [col for col in df.columns 
                        if col not in ["station_id", "latitude", "longitude", "altitude", "timestamp", "quality_flag"]]

        records: List[ObservationRecord] = []
        for _, row in df.iterrows():
            variables = {col: row[col] for col in variable_cols if pd.notna(row[col])}
            if not variables:
                continue
                
            record = ObservationRecord(
                station_id=str(row["station_id"]),
                latitude=float(row["latitude"]),
                longitude=float(row["longitude"]),
                altitude=float(row["altitude"]),
                timestamp=row["timestamp"],
                variables=variables,
                quality_flag=int(row.get("quality_flag", 0)),
            )
            records.append(record)

        timestamps = pd.DatetimeIndex(df["timestamp"].unique()).sort_values()
        stations = self._extract_stations(records)

        return ParsedDataset(
            records=records,
            timestamps=timestamps,
            stations=stations,
            variables=variable_cols,
            metadata={"source_file": str(file_path)},
        )

    def _parse_netcdf(self, file_path: Path) -> ParsedDataset:
        ds = xr.open_dataset(file_path)
        
        station_dim = self.config.get("station_dim", "station")
        time_dim = self.config.get("time_dim", "time")
        
        if station_dim not in ds.dims or time_dim not in ds.dims:
            raise ValueError(f"NetCDF must have dimensions: {station_dim}, {time_dim}")

        stations_data = self._extract_stations_from_xarray(ds, station_dim)
        
        records: List[ObservationRecord] = []
        variables = [var for var in ds.data_vars if set(ds[var].dims) >= {station_dim, time_dim}]

        for t_idx, timestamp in enumerate(ds[time_dim].values):
            for s_idx, station_id in enumerate(ds[station_dim].values):
                var_data = {}
                for var in variables:
                    value = ds[var].isel({station_dim: s_idx, time_dim: t_idx}).values
                    if not np.isnan(value):
                        var_data[var] = float(value)
                
                if var_data:
                    record = ObservationRecord(
                        station_id=str(station_id),
                        latitude=float(stations_data.iloc[s_idx]["latitude"]),
                        longitude=float(stations_data.iloc[s_idx]["longitude"]),
                        altitude=float(stations_data.iloc[s_idx].get("altitude", 0.0)),
                        timestamp=pd.Timestamp(timestamp),
                        variables=var_data,
                    )
                    records.append(record)

        timestamps = pd.DatetimeIndex(ds[time_dim].values)
        ds.close()

        return ParsedDataset(
            records=records,
            timestamps=timestamps,
            stations=stations_data,
            variables=variables,
            metadata={"source_file": str(file_path)},
        )

    def _parse_hdf5(self, file_path: Path) -> ParsedDataset:
        import h5py
        
        records: List[ObservationRecord] = []
        stations_dict: Dict[str, Dict[str, float]] = {}
        
        with h5py.File(file_path, "r") as f:
            stations_group = f.get("stations", f)
            for station_id in stations_group.keys():
                st = stations_group[station_id]
                stations_dict[station_id] = {
                    "latitude": float(st.attrs.get("latitude", 0.0)),
                    "longitude": float(st.attrs.get("longitude", 0.0)),
                    "altitude": float(st.attrs.get("altitude", 0.0)),
                }
            
            data_group = f.get("observations", f)
            timestamps_set = set()
            variables = []
            
            for station_id in data_group.keys():
                st_data = data_group[station_id]
                if "time" not in st_data:
                    continue
                    
                times = pd.to_datetime(st_data["time"][:])
                timestamps_set.update(times)
                
                if not variables:
                    variables = [k for k in st_data.keys() if k != "time"]
                
                st_info = stations_dict.get(station_id, {"latitude": 0.0, "longitude": 0.0, "altitude": 0.0})
                
                for t_idx, timestamp in enumerate(times):
                    var_data = {}
                    for var in variables:
                        value = st_data[var][t_idx]
                        if not np.isnan(value):
                            var_data[var] = float(value)
                    
                    if var_data:
                        record = ObservationRecord(
                            station_id=str(station_id),
                            latitude=st_info["latitude"],
                            longitude=st_info["longitude"],
                            altitude=st_info["altitude"],
                            timestamp=pd.Timestamp(timestamp),
                            variables=var_data,
                        )
                        records.append(record)

        timestamps = pd.DatetimeIndex(sorted(timestamps_set))
        stations = pd.DataFrame.from_dict(stations_dict, orient="index").reset_index()
        stations.columns = ["station_id", "latitude", "longitude", "altitude"]

        return ParsedDataset(
            records=records,
            timestamps=timestamps,
            stations=stations,
            variables=variables,
            metadata={"source_file": str(file_path)},
        )

    def _extract_stations(self, records: List[ObservationRecord]) -> pd.DataFrame:
        station_data: Dict[str, Dict[str, float]] = {}
        for rec in records:
            if rec.station_id not in station_data:
                station_data[rec.station_id] = {
                    "latitude": rec.latitude,
                    "longitude": rec.longitude,
                    "altitude": rec.altitude,
                }
        
        df = pd.DataFrame.from_dict(station_data, orient="index").reset_index()
        df.columns = ["station_id", "latitude", "longitude", "altitude"]
        return df

    def _extract_stations_from_xarray(self, ds: xr.Dataset, station_dim: str) -> pd.DataFrame:
        stations = pd.DataFrame({
            "station_id": ds[station_dim].values,
        })
        
        for coord in ["latitude", "longitude", "altitude"]:
            if coord in ds.coords:
                stations[coord] = ds[coord].values
            elif coord in ds.data_vars:
                stations[coord] = ds[coord].values
            else:
                stations[coord] = 0.0
        
        return stations

    def validate(self, dataset: Optional[ParsedDataset] = None) -> Dict[str, Any]:
        dataset = dataset or self.data
        if dataset is None:
            raise ValueError("No dataset loaded for validation")

        validation = {
            "total_records": len(dataset.records),
            "unique_stations": len(dataset.stations),
            "time_span": [str(dataset.timestamps.min()), str(dataset.timestamps.max())],
            "variables": dataset.variables,
            "missing_values": {},
            "outliers": {},
            "spatial_range": {
                "latitude": [dataset.stations["latitude"].min(), dataset.stations["latitude"].max()],
                "longitude": [dataset.stations["longitude"].min(), dataset.stations["longitude"].max()],
            },
        }

        df = dataset.to_dataframe()
        for var in dataset.variables:
            missing = df[var].isna().sum()
            validation["missing_values"][var] = {
                "count": int(missing),
                "percentage": float(missing / len(df) * 100),
            }
            
            z_scores = np.abs(stats.zscore(df[var].dropna()))
            outliers = (z_scores > 3).sum()
            validation["outliers"][var] = {
                "count": int(outliers),
                "percentage": float(outliers / len(df) * 100),
            }

        return validation

    def _get_physical_range(self, var: str) -> Optional[Tuple[float, float]]:
        if var in self._custom_ranges:
            return self._custom_ranges[var]
        for key, value in self.PHYSICAL_RANGES.items():
            if key in var.lower():
                return value
        return None

    def _detect_outliers_iqr(self, series: pd.Series, iqr_multiplier: float = 3.0) -> pd.Series:
        Q1 = series.quantile(0.25)
        Q3 = series.quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - iqr_multiplier * IQR
        upper_bound = Q3 + iqr_multiplier * IQR
        return (series < lower_bound) | (series > upper_bound)

    def clean(self, dataset: Optional[Union[ParsedDataset, pd.DataFrame]] = None, 
              remove_outliers: bool = True,
              fill_missing: bool = False,
              z_threshold: float = 3.0,
              use_physical_range: bool = True,
              use_quality_flag: bool = True,
              use_iqr: bool = True,
              per_station: bool = True,
              variables: Optional[List[str]] = None) -> pd.DataFrame:
        if dataset is None:
            dataset = self.data
        if dataset is None:
            raise ValueError("No dataset loaded for cleaning")
        
        if isinstance(dataset, ParsedDataset):
            df = dataset.to_dataframe()
            data_vars = dataset.variables
        else:
            df = dataset.copy()
            data_vars = variables or [col for col in df.columns if col not in ["timestamp", "station_id", "longitude", "latitude", "quality_flag"]]
        
        if use_quality_flag and "quality_flag" in df.columns:
            low_quality = df["quality_flag"] > 0
            n_removed = low_quality.sum()
            if n_removed > 0:
                logger.info(f"Removing {n_removed} records with quality_flag > 0")
                df.loc[low_quality, data_vars] = np.nan
        
        if use_physical_range:
            for var in data_vars:
                if var not in df.columns:
                    continue
                phys_range = self._get_physical_range(var)
                if phys_range:
                    invalid = (df[var] < phys_range[0]) | (df[var] > phys_range[1])
                    n_invalid = invalid.sum()
                    if n_invalid > 0:
                        logger.info(f"Removing {n_invalid} {var} values outside physical range {phys_range}")
                        df.loc[invalid, var] = np.nan
        
        if remove_outliers:
            for var in data_vars:
                if var not in df.columns:
                    continue
                if per_station and "station_id" in df.columns:
                    for station_id in df["station_id"].unique():
                        station_mask = df["station_id"] == station_id
                        station_data = df.loc[station_mask, var]
                        
                        if station_data.notna().sum() < 10:
                            continue
                        
                        valid_data = station_data.dropna()
                        if len(valid_data) > 0:
                            z_scores = np.abs(stats.zscore(valid_data))
                            outlier_mask = valid_data.index[z_scores > z_threshold]
                            df.loc[outlier_mask, var] = np.nan
                            
                            if use_iqr:
                                iqr_outliers = self._detect_outliers_iqr(station_data)
                                df.loc[station_mask & iqr_outliers, var] = np.nan
                else:
                    valid_data = df[var].dropna()
                    if len(valid_data) > 0:
                        z_scores = np.abs(stats.zscore(valid_data))
                        outlier_indices = valid_data.index[z_scores > z_threshold]
                        df.loc[outlier_indices, var] = np.nan
                        
                        if use_iqr:
                            iqr_outliers = self._detect_outliers_iqr(df[var])
                            df.loc[iqr_outliers, var] = np.nan
        
        if fill_missing:
            for var in data_vars:
                if var not in df.columns:
                    continue
                if df[var].isna().sum() > 0:
                    if "station_id" in df.columns:
                        df[var] = df.groupby("station_id")[var].transform(
                            lambda x: x.interpolate(method="time", limit_direction="both")
                        )
                    
                    global_mean = df[var].mean()
                    df[var] = df[var].fillna(global_mean)
        
        df = df.dropna(subset=data_vars, how="all")
        
        return df
