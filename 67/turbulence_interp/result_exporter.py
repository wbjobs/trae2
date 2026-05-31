import os
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Union
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr
import json

logger = logging.getLogger(__name__)


@dataclass
class ExportConfig:
    format: str = "netcdf"
    compression: bool = True
    compression_level: int = 4
    include_metadata: bool = True
    precision: str = "float32"


class ResultExporter:
    SUPPORTED_FORMATS = {
        "netcdf": ".nc",
        "csv": ".csv",
        "hdf5": ".h5",
        "geotiff": ".tif",
        "json": ".json",
        "parquet": ".parquet",
    }

    def __init__(self, config: Optional[ExportConfig] = None, **kwargs):
        self.config = config or ExportConfig(**kwargs)

    def export(self, dataset: xr.Dataset, output_path: Union[str, Path],
               format: Optional[str] = None, **kwargs) -> Path:
        output_path = Path(output_path)
        format = format or self.config.format

        if format not in self.SUPPORTED_FORMATS:
            raise ValueError(f"Unsupported export format: {format}")

        if output_path.suffix != self.SUPPORTED_FORMATS[format]:
            output_path = output_path.with_suffix(self.SUPPORTED_FORMATS[format])

        output_path.parent.mkdir(parents=True, exist_ok=True)

        export_func = getattr(self, f"_export_{format}", None)
        if export_func is None:
            raise ValueError(f"No exporter implemented for format: {format}")

        logger.info(f"Exporting dataset to {output_path} as {format}")
        
        result_path = export_func(dataset, output_path, **kwargs)
        logger.info(f"Successfully exported to {result_path}")
        
        return result_path

    def _export_netcdf(self, dataset: xr.Dataset, output_path: Path, **kwargs) -> Path:
        encoding = {}
        if self.config.compression:
            for var in dataset.data_vars:
                encoding[var] = {
                    "zlib": True,
                    "complevel": self.config.compression_level,
                    "dtype": self.config.precision,
                }

        dataset.to_netcdf(
            output_path,
            encoding=encoding if self.config.compression else None,
            format="NETCDF4",
        )
        return output_path

    def _export_csv(self, dataset: xr.Dataset, output_path: Path, **kwargs) -> Path:
        df = dataset.to_dataframe().reset_index()
        df.to_csv(output_path, index=False, float_format="%.6f")
        return output_path

    def _export_hdf5(self, dataset: xr.Dataset, output_path: Path, **kwargs) -> Path:
        import h5py

        with h5py.File(output_path, "w") as f:
            for dim_name, dim_values in dataset.coords.items():
                if dim_name in dataset.dims:
                    dset = f.create_dataset(
                        f"coords/{dim_name}",
                        data=dim_values.values,
                        compression="gzip" if self.config.compression else None,
                        compression_opts=self.config.compression_level if self.config.compression else None,
                    )
                    dset.attrs["units"] = str(dim_values.attrs.get("units", ""))

            for var_name, var_data in dataset.data_vars.items():
                dset = f.create_dataset(
                    f"data/{var_name}",
                    data=var_data.values.astype(self.config.precision),
                    compression="gzip" if self.config.compression else None,
                    compression_opts=self.config.compression_level if self.config.compression else None,
                )
                for attr_key, attr_val in var_data.attrs.items():
                    dset.attrs[attr_key] = str(attr_val)

            if self.config.include_metadata:
                meta_group = f.create_group("metadata")
                for key, value in dataset.attrs.items():
                    meta_group.attrs[key] = str(value)

        return output_path

    def _export_geotiff(self, dataset: xr.Dataset, output_path: Path, **kwargs) -> Path:
        try:
            import rasterio
            from rasterio.crs import CRS
            from rasterio.transform import from_origin
        except ImportError:
            raise ImportError("rasterio is required for GeoTIFF export")

        if "latitude" not in dataset.dims or "longitude" not in dataset.dims:
            raise ValueError("GeoTIFF export requires latitude and longitude dimensions")

        lats = dataset["latitude"].values
        lons = dataset["longitude"].values

        lat_res = lats[1] - lats[0] if len(lats) > 1 else 1.0
        lon_res = lons[1] - lons[0] if len(lons) > 1 else 1.0

        transform = from_origin(
            lons.min() - lon_res / 2,
            lats.max() + lat_res / 2,
            lon_res,
            lat_res,
        )

        crs = CRS.from_epsg(kwargs.get("epsg", 4326))

        data_vars = list(dataset.data_vars.keys())
        if len(data_vars) == 0:
            raise ValueError("No data variables to export")

        if "time" in dataset.dims:
            time_index = 0
            for t_idx, time_val in enumerate(dataset["time"].values):
                time_path = output_path.parent / f"{output_path.stem}_t{t_idx}{output_path.suffix}"
                self._write_geotiff(
                    dataset.isel(time=t_idx),
                    time_path,
                    transform,
                    crs,
                    lat_res,
                    lon_res,
                )
            return output_path.parent
        else:
            return self._write_geotiff(
                dataset,
                output_path,
                transform,
                crs,
                lat_res,
                lon_res,
            )

    def _write_geotiff(self, dataset: xr.Dataset, output_path: Path, transform, crs,
                      lat_res: float, lon_res: float) -> Path:
        try:
            import rasterio
        except ImportError:
            raise ImportError("rasterio is required for GeoTIFF export")

        data_vars = list(dataset.data_vars.keys())
        height = dataset.sizes["latitude"]
        width = dataset.sizes["longitude"]
        count = len(data_vars)

        with rasterio.open(
            output_path,
            "w",
            driver="GTiff",
            height=height,
            width=width,
            count=count,
            dtype=self.config.precision,
            crs=crs,
            transform=transform,
            compress="deflate" if self.config.compression else None,
            zlevel=self.config.compression_level if self.config.compression else None,
        ) as dst:
            for i, var_name in enumerate(data_vars, 1):
                data = dataset[var_name].values
                if data.ndim == 2:
                    dst.write(data.astype(self.config.precision), i)
                dst.set_band_description(i, var_name)

        return output_path

    def _export_json(self, dataset: xr.Dataset, output_path: Path, **kwargs) -> Path:
        data_dict = {
            "attrs": {k: str(v) for k, v in dataset.attrs.items()},
            "coords": {},
            "data": {},
        }

        for coord_name, coord in dataset.coords.items():
            data_dict["coords"][coord_name] = coord.values.tolist()

        for var_name, var in dataset.data_vars.items():
            data_dict["data"][var_name] = {
                "values": var.values.tolist(),
                "dims": list(var.dims),
                "attrs": {k: str(v) for k, v in var.attrs.items()},
            }

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data_dict, f, indent=2, ensure_ascii=False)

        return output_path

    def _export_parquet(self, dataset: xr.Dataset, output_path: Path, **kwargs) -> Path:
        try:
            import pyarrow as pa
            import pyarrow.parquet as pq
        except ImportError:
            raise ImportError("pyarrow is required for Parquet export")

        df = dataset.to_dataframe().reset_index()
        table = pa.Table.from_pandas(df)
        
        pq.write_table(
            table,
            output_path,
            compression="snappy" if self.config.compression else None,
        )
        return output_path

    def export_batch(self, datasets: List[xr.Dataset], output_dir: Union[str, Path],
                    format: Optional[str] = None, prefix: str = "result") -> List[Path]:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        paths = []
        for i, ds in enumerate(datasets):
            output_path = output_dir / f"{prefix}_{i}"
            path = self.export(ds, output_path, format=format)
            paths.append(path)

        return paths

    def export_variables(self, dataset: xr.Dataset, variables: List[str],
                        output_dir: Union[str, Path], format: Optional[str] = None,
                        separate_files: bool = True) -> List[Path]:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        paths = []

        if separate_files:
            for var in variables:
                if var not in dataset.data_vars:
                    logger.warning(f"Variable {var} not found in dataset, skipping")
                    continue
                var_ds = dataset[[var]]
                output_path = output_dir / var
                path = self.export(var_ds, output_path, format=format)
                paths.append(path)
        else:
            vars_to_export = [v for v in variables if v in dataset.data_vars]
            if vars_to_export:
                sub_ds = dataset[vars_to_export]
                output_path = output_dir / "combined"
                path = self.export(sub_ds, output_path, format=format)
                paths.append(path)

        return paths

    @staticmethod
    def supported_formats() -> List[str]:
        return list(ResultExporter.SUPPORTED_FORMATS.keys())
