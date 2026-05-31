import logging
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, Tuple, List
from enum import Enum

import numpy as np
import xarray as xr
from scipy import ndimage

logger = logging.getLogger(__name__)


class GradientMethod(Enum):
    CENTRAL = "central"
    FORWARD = "forward"
    BACKWARD = "backward"
    SOBEL = "sobel"
    PREWITT = "prewitt"


@dataclass
class GradientConfig:
    method: GradientMethod = GradientMethod.CENTRAL
    use_smoothing: bool = True
    smoothing_sigma: float = 1.0
    edge_mode: str = "reflect"
    dx: Optional[float] = None
    dy: Optional[float] = None
    dt: Optional[float] = None


@dataclass
class TurbulenceMetrics:
    spatial_gradient: xr.Dataset
    temporal_gradient: xr.Dataset
    vorticity: xr.DataArray
    divergence: xr.DataArray
    deformation: xr.DataArray
    energy: xr.DataArray
    metadata: Dict[str, Any] = field(default_factory=dict)


class TurbulenceGradientAnalyzer:
    def __init__(self, config: Optional[GradientConfig] = None, **kwargs):
        self.config = config or GradientConfig(**kwargs)

    def _get_spacing(self, da: xr.DataArray, dim: str) -> float:
        coords = da[dim].values
        if len(coords) < 2:
            return 1.0
        return float(np.mean(np.diff(coords)))

    def compute_spatial_gradient(
        self,
        da: xr.DataArray,
        lon_dim: str = "longitude",
        lat_dim: str = "latitude",
    ) -> xr.Dataset:
        dx = self.config.dx or self._get_spacing(da, lon_dim)
        dy = self.config.dy or self._get_spacing(da, lat_dim)

        data = da.values
        if self.config.use_smoothing:
            data = ndimage.gaussian_filter(
                data, sigma=self.config.smoothing_sigma, mode=self.config.edge_mode
            )

        if self.config.method == GradientMethod.CENTRAL:
            ddx, ddy = np.gradient(data, dx, dy, axis=(-1, -2))
        elif self.config.method == GradientMethod.SOBEL:
            ddx = ndimage.sobel(data, axis=-1) / (8 * dx)
            ddy = ndimage.sobel(data, axis=-2) / (8 * dy)
        elif self.config.method == GradientMethod.PREWITT:
            ddx = ndimage.prewitt(data, axis=-1) / (2 * dx)
            ddy = ndimage.prewitt(data, axis=-2) / (2 * dy)
        elif self.config.method == GradientMethod.FORWARD:
            ddx = np.roll(data, -1, axis=-1) - data
            ddy = np.roll(data, -1, axis=-2) - data
            ddx /= dx
            ddy /= dy
        elif self.config.method == GradientMethod.BACKWARD:
            ddx = data - np.roll(data, 1, axis=-1)
            ddy = data - np.roll(data, 1, axis=-2)
            ddx /= dx
            ddy /= dy
        else:
            raise ValueError(f"Unknown gradient method: {self.config.method}")

        dims = da.dims
        coords = da.coords

        dlon_da = xr.DataArray(ddx, dims=dims, coords=coords, name=f"{da.name}_dlon")
        dlat_da = xr.DataArray(ddy, dims=dims, coords=coords, name=f"{da.name}_dlat")

        magnitude = np.sqrt(ddx**2 + ddy**2)
        magnitude_da = xr.DataArray(
            magnitude, dims=dims, coords=coords, name=f"{da.name}_gradient_magnitude"
        )

        direction = np.arctan2(ddy, ddx) * 180 / np.pi
        direction_da = xr.DataArray(
            direction, dims=dims, coords=coords, name=f"{da.name}_gradient_direction"
        )

        return xr.Dataset(
            {
                f"{da.name}_dlon": dlon_da,
                f"{da.name}_dlat": dlat_da,
                f"{da.name}_gradient_magnitude": magnitude_da,
                f"{da.name}_gradient_direction": direction_da,
            }
        )

    def compute_temporal_gradient(
        self,
        da: xr.DataArray,
        time_dim: str = "time",
    ) -> xr.Dataset:
        dt = self.config.dt or self._get_spacing(da, time_dim)

        data = da.values
        if self.config.use_smoothing and data.ndim > 1:
            smooth_axis = da.dims.index(time_dim)
            data = ndimage.gaussian_filter1d(
                data, sigma=self.config.smoothing_sigma, axis=smooth_axis
            )

        if data.ndim == 1:
            ddt = np.gradient(data, dt)
        else:
            time_axis = da.dims.index(time_dim)
            ddt = np.gradient(data, dt, axis=time_axis)

        dims = da.dims
        coords = da.coords

        ddt_da = xr.DataArray(ddt, dims=dims, coords=coords, name=f"{da.name}_dt")

        rate_of_change = ddt / (np.abs(da.values) + 1e-10) * 100
        roc_da = xr.DataArray(
            rate_of_change,
            dims=dims,
            coords=coords,
            name=f"{da.name}_rate_of_change_pct",
        )

        return xr.Dataset(
            {
                f"{da.name}_dt": ddt_da,
                f"{da.name}_rate_of_change_pct": roc_da,
            }
        )

    def compute_vorticity(
        self,
        ds: xr.Dataset,
        u_var: str = "u",
        v_var: str = "v",
        lon_dim: str = "longitude",
        lat_dim: str = "latitude",
    ) -> xr.DataArray:
        u = ds[u_var]
        v = ds[v_var]

        dx = self.config.dx or self._get_spacing(u, lon_dim)
        dy = self.config.dy or self._get_spacing(u, lat_dim)

        u_data = u.values
        v_data = v.values

        if self.config.use_smoothing:
            u_data = ndimage.gaussian_filter(
                u_data, sigma=self.config.smoothing_sigma, mode=self.config.edge_mode
            )
            v_data = ndimage.gaussian_filter(
                v_data, sigma=self.config.smoothing_sigma, mode=self.config.edge_mode
            )

        dv_dx = np.gradient(v_data, dx, axis=-1)
        du_dy = np.gradient(u_data, dy, axis=-2)

        vorticity = dv_dx - du_dy

        return xr.DataArray(
            vorticity,
            dims=u.dims,
            coords=u.coords,
            name="vorticity",
        )

    def compute_divergence(
        self,
        ds: xr.Dataset,
        u_var: str = "u",
        v_var: str = "v",
        lon_dim: str = "longitude",
        lat_dim: str = "latitude",
    ) -> xr.DataArray:
        u = ds[u_var]
        v = ds[v_var]

        dx = self.config.dx or self._get_spacing(u, lon_dim)
        dy = self.config.dy or self._get_spacing(u, lat_dim)

        u_data = u.values
        v_data = v.values

        if self.config.use_smoothing:
            u_data = ndimage.gaussian_filter(
                u_data, sigma=self.config.smoothing_sigma, mode=self.config.edge_mode
            )
            v_data = ndimage.gaussian_filter(
                v_data, sigma=self.config.smoothing_sigma, mode=self.config.edge_mode
            )

        du_dx = np.gradient(u_data, dx, axis=-1)
        dv_dy = np.gradient(v_data, dy, axis=-2)

        divergence = du_dx + dv_dy

        return xr.DataArray(
            divergence,
            dims=u.dims,
            coords=u.coords,
            name="divergence",
        )

    def compute_deformation(
        self,
        ds: xr.Dataset,
        u_var: str = "u",
        v_var: str = "v",
        lon_dim: str = "longitude",
        lat_dim: str = "latitude",
    ) -> xr.Dataset:
        u = ds[u_var]
        v = ds[v_var]

        dx = self.config.dx or self._get_spacing(u, lon_dim)
        dy = self.config.dy or self._get_spacing(u, lat_dim)

        u_data = u.values
        v_data = v.values

        if self.config.use_smoothing:
            u_data = ndimage.gaussian_filter(
                u_data, sigma=self.config.smoothing_sigma, mode=self.config.edge_mode
            )
            v_data = ndimage.gaussian_filter(
                v_data, sigma=self.config.smoothing_sigma, mode=self.config.edge_mode
            )

        du_dx = np.gradient(u_data, dx, axis=-1)
        du_dy = np.gradient(u_data, dy, axis=-2)
        dv_dx = np.gradient(v_data, dx, axis=-1)
        dv_dy = np.gradient(v_data, dy, axis=-2)

        stretching = du_dx - dv_dy
        shearing = dv_dx + du_dy
        total_deformation = np.sqrt(stretching**2 + shearing**2)

        return xr.Dataset(
            {
                "stretching_deformation": (u.dims, stretching),
                "shearing_deformation": (u.dims, shearing),
                "total_deformation": (u.dims, total_deformation),
            },
            coords=u.coords,
        )

    def compute_turbulence_energy(
        self,
        ds: xr.Dataset,
        u_var: str = "u",
        v_var: str = "v",
        w_var: Optional[str] = None,
    ) -> xr.DataArray:
        u = ds[u_var].values
        v = ds[v_var].values

        if w_var and w_var in ds:
            w = ds[w_var].values
            energy = 0.5 * (u**2 + v**2 + w**2)
        else:
            energy = 0.5 * (u**2 + v**2)

        return xr.DataArray(
            energy,
            dims=ds[u_var].dims,
            coords=ds[u_var].coords,
            name="turbulence_energy",
        )

    def analyze_dataset(
        self,
        ds: xr.Dataset,
        variables: Optional[List[str]] = None,
        compute_spatial_gradient: bool = True,
        compute_spatial: bool = True,
        compute_temporal: bool = True,
        compute_vorticity: bool = False,
        compute_divergence: bool = False,
        compute_deformation: bool = False,
        compute_energy: bool = False,
        velocity_vars: Optional[Tuple[str, str, Optional[str]]] = None,
        lon_dim: str = "longitude",
        lat_dim: str = "latitude",
        time_dim: str = "time",
        **kwargs,
    ) -> xr.Dataset:
        if variables is None:
            variables = [
                v for v in ds.data_vars if len(ds[v].dims) >= 2 and set(ds[v].dims) & {lat_dim, lon_dim}
            ]

        result_ds = ds.copy()
        compute_spatial = compute_spatial or compute_spatial_gradient

        for var in variables:
            if var not in ds.data_vars:
                continue

            da = ds[var]
            has_spatial = set(da.dims) >= {lat_dim, lon_dim}
            has_time = time_dim in da.dims

            if compute_spatial and has_spatial:
                grad_ds = self.compute_spatial_gradient(da, lon_dim=lon_dim, lat_dim=lat_dim)
                result_ds.update(grad_ds)
                logger.info(f"Computed spatial gradients for {var}")

            if compute_temporal and has_time:
                temp_grad_ds = self.compute_temporal_gradient(da, time_dim=time_dim)
                result_ds.update(temp_grad_ds)
                logger.info(f"Computed temporal gradients for {var}")

        if compute_vorticity or compute_divergence or compute_deformation:
            if velocity_vars:
                u_var, v_var, w_var = velocity_vars[0], velocity_vars[1], velocity_vars[2] if len(velocity_vars) > 2 else None
            else:
                u_var, v_var, w_var = "u", "v", None

            has_velocities = u_var in ds.data_vars and v_var in ds.data_vars
            if has_velocities:
                if compute_vorticity:
                    result_ds["vorticity"] = self.compute_vorticity(ds, u_var, v_var, lon_dim=lon_dim, lat_dim=lat_dim)
                    logger.info("Computed vorticity")
                if compute_divergence:
                    result_ds["divergence"] = self.compute_divergence(ds, u_var, v_var, lon_dim=lon_dim, lat_dim=lat_dim)
                    logger.info("Computed divergence")
                if compute_deformation:
                    def_ds = self.compute_deformation(ds, u_var, v_var, lon_dim=lon_dim, lat_dim=lat_dim)
                    if isinstance(def_ds, xr.Dataset):
                        result_ds.update(def_ds)
                    else:
                        result_ds["total_deformation"] = def_ds
                    logger.info("Computed deformation")
                if compute_energy:
                    result_ds["turbulence_energy"] = self.compute_turbulence_energy(ds, u_var, v_var, w_var)
                    logger.info("Computed turbulence energy")
            else:
                logger.warning(f"Velocity variables {u_var}, {v_var} not found, skipping vortex/divergence/energy calculations")

        result_ds.attrs.update(
            {
                "gradient_method": self.config.method.value,
                "smoothing_applied": self.config.use_smoothing,
                "smoothing_sigma": self.config.smoothing_sigma if self.config.use_smoothing else 0.0,
            }
        )

        return result_ds

    @staticmethod
    def available_methods() -> List[str]:
        return [m.value for m in GradientMethod]
