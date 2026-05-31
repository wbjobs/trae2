import numpy as np
import pandas as pd
import json
import csv
from pathlib import Path
from typing import Dict, Any, Optional, List, Union
from dataclasses import dataclass, field
from datetime import datetime
import struct

from config import OutputConfig
from spatial_interpolator import InterpolationResult
from data_parser import OceanObservation
from utils import setup_logger, ensure_directory, save_json, generate_task_id

logger = setup_logger("result_exporter")


@dataclass
class ExportResult:
    file_path: Path
    format: str
    variable: str
    file_size_mb: float
    export_time: float
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "file_path": str(self.file_path),
            "format": self.format,
            "variable": self.variable,
            "file_size_mb": self.file_size_mb,
            "export_time": self.export_time,
            "metadata": self.metadata
        }


class ResultExporter:
    def __init__(self, config: OutputConfig):
        self.config = config
        self._output_dir = Path(config.output_dir)
        ensure_directory(self._output_dir)

    def _get_filename(self, variable: str, fmt: str) -> str:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        extension = self._get_extension(fmt)
        return f"{self.config.filename_prefix}_{variable}_{timestamp}.{extension}"

    @staticmethod
    def _get_extension(fmt: str) -> str:
        extensions = {
            "netcdf": "nc",
            "csv": "csv",
            "json": "json",
            "parquet": "parquet",
            "mat": "mat",
            "hdf5": "h5",
            "geotiff": "tif",
            "binary": "bin"
        }
        return extensions.get(fmt.lower(), fmt)

    def export(
        self,
        result: InterpolationResult,
        formats: Optional[List[str]] = None
    ) -> List[ExportResult]:
        formats = formats or self.config.formats
        export_results = []

        for fmt in formats:
            try:
                export_result = self._export_format(result, fmt)
                if export_result:
                    export_results.append(export_result)
            except Exception as e:
                logger.error(f"Failed to export {result.variable} to {fmt}: {e}")

        return export_results

    def _export_format(
        self,
        result: InterpolationResult,
        fmt: str
    ) -> Optional[ExportResult]:
        import time
        start_time = time.time()

        filename = self._get_filename(result.variable, fmt)
        file_path = self._output_dir / filename

        fmt_lower = fmt.lower()
        if fmt_lower == "netcdf":
            self._export_netcdf(result, file_path)
        elif fmt_lower == "csv":
            self._export_csv(result, file_path)
        elif fmt_lower == "json":
            self._export_json(result, file_path)
        elif fmt_lower == "parquet":
            self._export_parquet(result, file_path)
        elif fmt_lower == "mat":
            self._export_mat(result, file_path)
        elif fmt_lower == "hdf5":
            self._export_hdf5(result, file_path)
        elif fmt_lower == "binary":
            self._export_binary(result, file_path)
        else:
            logger.warning(f"Unsupported export format: {fmt}")
            return None

        export_time = time.time() - start_time
        file_size_mb = file_path.stat().st_size / (1024 * 1024)

        logger.info(f"Exported {result.variable} to {file_path} ({file_size_mb:.2f} MB)")

        return ExportResult(
            file_path=file_path,
            format=fmt,
            variable=result.variable,
            file_size_mb=file_size_mb,
            export_time=export_time,
            metadata={
                "shape": result.values.shape,
                "method": result.method,
                "statistics": result.statistics
            }
        )

    def _export_netcdf(self, result: InterpolationResult, file_path: Path) -> None:
        try:
            import xarray as xr
        except ImportError:
            raise ImportError("xarray is required for NetCDF export")

        ds = xr.Dataset(
            {
                result.variable: (["longitude", "latitude", "depth"], result.values),
            },
            coords={
                "longitude": result.lon_grid,
                "latitude": result.lat_grid,
                "depth": result.depth_grid,
            },
            attrs={
                "interpolation_method": result.method,
                "created_at": datetime.now().isoformat(),
                **result.statistics,
                **result.metadata
            }
        )

        if self.config.compression:
            encoding = {
                result.variable: {
                    "zlib": True,
                    "complevel": 4
                }
            }
            ds.to_netcdf(file_path, encoding=encoding)
        else:
            ds.to_netcdf(file_path)

    def _export_csv(self, result: InterpolationResult, file_path: Path) -> None:
        lon_grid, lat_grid, depth_grid = np.meshgrid(
            result.lon_grid,
            result.lat_grid,
            result.depth_grid,
            indexing="ij"
        )

        df = pd.DataFrame({
            "longitude": lon_grid.ravel(),
            "latitude": lat_grid.ravel(),
            "depth": depth_grid.ravel(),
            result.variable: result.values.ravel()
        })

        df.to_csv(file_path, index=False)

    def _export_json(self, result: InterpolationResult, file_path: Path) -> None:
        data = {
            "variable": result.variable,
            "method": result.method,
            "statistics": result.statistics,
            "metadata": result.metadata,
            "created_at": datetime.now().isoformat(),
            "coordinates": {
                "longitude": result.lon_grid.tolist(),
                "latitude": result.lat_grid.tolist(),
                "depth": result.depth_grid.tolist(),
            },
            "shape": result.values.shape,
            "values": result.values.tolist()
        }

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)

    def _export_parquet(self, result: InterpolationResult, file_path: Path) -> None:
        lon_grid, lat_grid, depth_grid = np.meshgrid(
            result.lon_grid,
            result.lat_grid,
            result.depth_grid,
            indexing="ij"
        )

        df = pd.DataFrame({
            "longitude": lon_grid.ravel(),
            "latitude": lat_grid.ravel(),
            "depth": depth_grid.ravel(),
            result.variable: result.values.ravel()
        })

        df.to_parquet(file_path, index=False)

    def _export_mat(self, result: InterpolationResult, file_path: Path) -> None:
        try:
            import scipy.io as sio
        except ImportError:
            raise ImportError("scipy is required for MAT export")

        data = {
            result.variable: result.values,
            "longitude": result.lon_grid,
            "latitude": result.lat_grid,
            "depth": result.depth_grid,
            "method": result.method,
            "statistics": result.statistics,
            "metadata": result.metadata
        }

        sio.savemat(file_path, data)

    def _export_hdf5(self, result: InterpolationResult, file_path: Path) -> None:
        try:
            import h5py
        except ImportError:
            raise ImportError("h5py is required for HDF5 export")

        with h5py.File(file_path, "w") as f:
            dset = f.create_dataset(
                result.variable,
                data=result.values,
                compression="gzip" if self.config.compression else None
            )
            f.create_dataset("longitude", data=result.lon_grid)
            f.create_dataset("latitude", data=result.lat_grid)
            f.create_dataset("depth", data=result.depth_grid)

            for key, value in result.statistics.items():
                dset.attrs[key] = value

            dset.attrs["method"] = result.method
            dset.attrs["created_at"] = datetime.now().isoformat()

    def _export_binary(self, result: InterpolationResult, file_path: Path) -> None:
        with open(file_path, "wb") as f:
            header = struct.pack(
                "iiiiddd",
                *result.values.shape,
                result.lon_grid[0], result.lat_grid[0], result.depth_grid[0]
            )
            f.write(header)
            result.values.astype(np.float32).tofile(f)

    def export_observations(
        self,
        observations: List[OceanObservation],
        filename: Optional[str] = None
    ) -> ExportResult:
        import time
        start_time = time.time()

        if filename is None:
            filename = f"{self.config.filename_prefix}_observations.csv"

        file_path = self._output_dir / filename

        dfs = []
        for obs in observations:
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

        combined_df = pd.concat(dfs, ignore_index=True)
        combined_df.to_csv(file_path, index=False)

        export_time = time.time() - start_time
        file_size_mb = file_path.stat().st_size / (1024 * 1024)

        return ExportResult(
            file_path=file_path,
            format="csv",
            variable="observations",
            file_size_mb=file_size_mb,
            export_time=export_time,
            metadata={"n_stations": len(observations)}
        )

    def export_metadata(
        self,
        results: List[InterpolationResult],
        metadata: Dict[str, Any],
        filename: Optional[str] = None
    ) -> ExportResult:
        import time
        start_time = time.time()

        if filename is None:
            filename = f"{self.config.filename_prefix}_metadata.json"

        file_path = self._output_dir / filename

        metadata_doc = {
            "created_at": datetime.now().isoformat(),
            "n_variables": len(results),
            "variables": [
                {
                    "name": r.variable,
                    "method": r.method,
                    "shape": list(r.values.shape),
                    "statistics": r.statistics,
                    "metadata": r.metadata
                }
                for r in results
            ],
            **metadata
        }

        save_json(metadata_doc, file_path)

        export_time = time.time() - start_time
        file_size_mb = file_path.stat().st_size / (1024 * 1024)

        return ExportResult(
            file_path=file_path,
            format="json",
            variable="metadata",
            file_size_mb=file_size_mb,
            export_time=export_time
        )

    def export_summary_report(
        self,
        results: List[InterpolationResult],
        filename: Optional[str] = None
    ) -> ExportResult:
        import time
        start_time = time.time()

        if filename is None:
            filename = f"{self.config.filename_prefix}_summary.txt"

        file_path = self._output_dir / filename

        with open(file_path, "w", encoding="utf-8") as f:
            f.write("=" * 60 + "\n")
            f.write("Ocean Interpolation Results Summary Report\n")
            f.write("=" * 60 + "\n\n")
            f.write(f"Generated: {datetime.now().isoformat()}\n")
            f.write(f"Number of variables: {len(results)}\n\n")

            for result in results:
                f.write("-" * 60 + "\n")
                f.write(f"Variable: {result.variable}\n")
                f.write(f"Method: {result.method}\n")
                f.write(f"Shape: {result.values.shape}\n")
                f.write(f"Statistics:\n")
                for stat_name, stat_value in result.statistics.items():
                    f.write(f"  {stat_name}: {stat_value:.4f}\n")
                if result.metadata:
                    f.write(f"Metadata:\n")
                    for key, value in result.metadata.items():
                        f.write(f"  {key}: {value}\n")
                f.write("\n")

        export_time = time.time() - start_time
        file_size_mb = file_path.stat().st_size / (1024 * 1024)

        return ExportResult(
            file_path=file_path,
            format="txt",
            variable="summary",
            file_size_mb=file_size_mb,
            export_time=export_time
        )

    def export_batch(
        self,
        results: List[InterpolationResult],
        formats: Optional[List[str]] = None
    ) -> List[ExportResult]:
        all_results = []
        for result in results:
            export_results = self.export(result, formats)
            all_results.extend(export_results)
        return all_results


class BatchExporter:
    def __init__(self, config: OutputConfig):
        self.config = config
        self.exporter = ResultExporter(config)

    def export_all(
        self,
        results: List[InterpolationResult],
        observations: Optional[List[OceanObservation]] = None,
        additional_metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        export_results = self.exporter.export_batch(results)

        if observations:
            obs_result = self.exporter.export_observations(observations)
            export_results.append(obs_result)

        metadata = additional_metadata or {}
        metadata_result = self.exporter.export_metadata(results, metadata)
        export_results.append(metadata_result)

        summary_result = self.exporter.export_summary_report(results)
        export_results.append(summary_result)

        total_size = sum(r.file_size_mb for r in export_results)
        total_time = sum(r.export_time for r in export_results)

        return {
            "export_results": [r.to_dict() for r in export_results],
            "total_size_mb": total_size,
            "total_time": total_time,
            "n_files": len(export_results)
        }
