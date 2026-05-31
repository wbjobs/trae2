import numpy as np
import pandas as pd
from typing import Dict, Any, List, Tuple, Optional, Union
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime
from scipy.spatial import KDTree
from scipy import interpolate

from utils import setup_logger, haversine_distance
from data_parser import OceanObservation, OceanDataParser
from profile_analyzer import ProfileAnalyzer

logger = setup_logger("multi_cruise")


@dataclass
class CruiseMetadata:
    cruise_id: str
    name: str
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    vessel_name: str = ""
    chief_scientist: str = ""
    region: str = ""
    n_stations: int = 0
    quality_level: int = 1
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CruiseData:
    metadata: CruiseMetadata
    observations: List[OceanObservation]

    def __len__(self) -> int:
        return len(self.observations)

    def summary(self) -> Dict[str, Any]:
        lons = [obs.longitude[0] for obs in self.observations if len(obs.longitude) > 0]
        lats = [obs.latitude[0] for obs in self.observations if len(obs.latitude) > 0]

        return {
            "cruise_id": self.metadata.cruise_id,
            "name": self.metadata.name,
            "n_stations": len(self.observations),
            "lon_range": [float(np.min(lons)), float(np.max(lons))] if lons else [0, 0],
            "lat_range": [float(np.min(lats)), float(np.max(lats))] if lats else [0, 0],
            "start_date": str(self.metadata.start_date) if self.metadata.start_date else None,
            "end_date": str(self.metadata.end_date) if self.metadata.end_date else None,
        }


@dataclass
class MergedDataSet:
    cruises: List[CruiseData]
    merged_observations: List[OceanObservation]
    weights: Dict[str, np.ndarray] = field(default_factory=dict)
    merge_metadata: Dict[str, Any] = field(default_factory=dict)

    def __len__(self) -> int:
        return len(self.merged_observations)


class CruiseDataLoader:
    def __init__(self):
        self.parser = OceanDataParser()

    def load_cruise_directory(
        self,
        directory: Union[str, Path],
        cruise_id: str,
        cruise_name: str = "",
        **kwargs
    ) -> CruiseData:
        directory = Path(directory)

        observations = self.parser.parse_directory(directory)

        metadata = CruiseMetadata(
            cruise_id=cruise_id,
            name=cruise_name or cruise_id,
            n_stations=len(observations),
            **kwargs
        )

        logger.info(f"Loaded cruise {cruise_id}: {len(observations)} stations from {directory}")

        return CruiseData(metadata=metadata, observations=observations)

    def load_multiple_cruises(
        self,
        cruise_configs: List[Dict[str, Any]]
    ) -> List[CruiseData]:
        cruises = []
        for config in cruise_configs:
            cruise = self.load_cruise_directory(**config)
            cruises.append(cruise)
        return cruises


class SpatioTemporalAligner:
    @staticmethod
    def extract_station_coordinates(
        observations: List[OceanObservation]
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        lons = np.array([float(np.nanmean(obs.longitude)) for obs in observations])
        lats = np.array([float(np.nanmean(obs.latitude)) for obs in observations])
        times = np.array([0.0 for obs in observations])

        return lons, lats, times

    @staticmethod
    def align_to_common_grid(
        profiles: List[np.ndarray],
        depths: List[np.ndarray],
        target_depths: np.ndarray
    ) -> List[np.ndarray]:
        aligned = []
        for profile, depth in zip(profiles, depths):
            f = interpolate.interp1d(
                depth, profile,
                kind='linear',
                bounds_error=False,
                fill_value=np.nan
            )
            aligned.append(f(target_depths))
        return aligned

    @staticmethod
    def find_nearby_stations(
        target_lon: float,
        target_lat: float,
        source_lons: np.ndarray,
        source_lats: np.ndarray,
        max_distance_km: float = 50.0
    ) -> Tuple[np.ndarray, np.ndarray]:
        distances = np.array([
            haversine_distance(target_lon, target_lat, lon, lat)
            for lon, lat in zip(source_lons, source_lats)
        ])

        nearby_mask = distances <= max_distance_km
        nearby_indices = np.where(nearby_mask)[0]
        nearby_distances = distances[nearby_mask]

        sort_idx = np.argsort(nearby_distances)

        return nearby_indices[sort_idx], nearby_distances[sort_idx]

    @staticmethod
    def calculate_spatial_weights(
        distances: np.ndarray,
        method: str = "gaussian",
        bandwidth: float = 20.0
    ) -> np.ndarray:
        if len(distances) == 0:
            return np.array([])

        if method == "idw":
            weights = 1.0 / (distances + 1e-6)
        elif method == "gaussian":
            weights = np.exp(-distances ** 2 / (2 * bandwidth ** 2))
        elif method == "exponential":
            weights = np.exp(-distances / bandwidth)
        elif method == "uniform":
            weights = np.ones_like(distances)
        else:
            raise ValueError(f"Unknown weighting method: {method}")

        weights /= weights.sum()
        return weights


class MultiCruiseMerger:
    def __init__(
        self,
        max_distance_km: float = 50.0,
        weighting_method: str = "gaussian",
        bandwidth: float = 20.0
    ):
        self.max_distance_km = max_distance_km
        self.weighting_method = weighting_method
        self.bandwidth = bandwidth
        self.aligner = SpatioTemporalAligner()

    def merge_by_proximity(
        self,
        cruises: List[CruiseData],
        reference_cruise_idx: int = 0
    ) -> MergedDataSet:
        if len(cruises) < 2:
            raise ValueError("At least 2 cruises required for merging")

        reference = cruises[reference_cruise_idx]
        ref_lons, ref_lats, _ = self.aligner.extract_station_coordinates(reference.observations)

        merged_obs = []
        station_weights = {}

        for station_idx, ref_obs in enumerate(reference.observations):
            target_lon = ref_lons[station_idx]
            target_lat = ref_lats[station_idx]

            all_profiles_temp = [ref_obs.temperature]
            all_profiles_sal = [ref_obs.salinity]
            all_depths = [ref_obs.depth]
            all_distances = [0.0]
            all_cruise_ids = [reference.metadata.cruise_id]

            for cruise_idx, cruise in enumerate(cruises):
                if cruise_idx == reference_cruise_idx:
                    continue

                src_lons, src_lats, _ = self.aligner.extract_station_coordinates(cruise.observations)
                nearby_indices, distances = self.aligner.find_nearby_stations(
                    target_lon, target_lat, src_lons, src_lats, self.max_distance_km
                )

                for idx, dist in zip(nearby_indices, distances):
                    src_obs = cruise.observations[idx]
                    all_profiles_temp.append(src_obs.temperature)
                    all_profiles_sal.append(src_obs.salinity)
                    all_depths.append(src_obs.depth)
                    all_distances.append(dist)
                    all_cruise_ids.append(cruise.metadata.cruise_id)

            if len(all_profiles_temp) > 1:
                common_depths = self._get_common_depth_grid(all_depths)

                aligned_temp = self.aligner.align_to_common_grid(
                    all_profiles_temp, all_depths, common_depths
                )
                aligned_sal = self.aligner.align_to_common_grid(
                    all_profiles_sal, all_depths, common_depths
                )

                distances = np.array(all_distances)
                weights = self.aligner.calculate_spatial_weights(
                    distances, self.weighting_method, self.bandwidth
                )

                weights_3d = weights[:, np.newaxis]

                merged_temp = np.nansum(
                    [aligned_temp[i] * weights[i] for i in range(len(weights))],
                    axis=0
                )
                merged_sal = np.nansum(
                    [aligned_sal[i] * weights[i] for i in range(len(weights))],
                    axis=0
                )

                merged_obs.append(
                    OceanObservation(
                        station_id=f"MERGED_{station_idx:04d}",
                        time=ref_obs.time,
                        longitude=np.array([target_lon] * len(common_depths)),
                        latitude=np.array([target_lat] * len(common_depths)),
                        depth=common_depths,
                        temperature=merged_temp,
                        salinity=merged_sal,
                        metadata={
                            "n_contributing": len(all_profiles_temp),
                            "cruise_ids": list(set(all_cruise_ids)),
                            "weights": weights.tolist(),
                            "distances": distances.tolist(),
                        }
                    )
                )

                station_weights[f"MERGED_{station_idx:04d}"] = weights

        return MergedDataSet(
            cruises=cruises,
            merged_observations=merged_obs,
            weights=station_weights,
            merge_metadata={
                "max_distance_km": self.max_distance_km,
                "weighting_method": self.weighting_method,
                "bandwidth": self.bandwidth,
                "reference_cruise": reference.metadata.cruise_id,
            }
        )

    @staticmethod
    def _get_common_depth_grid(all_depths: List[np.ndarray]) -> np.ndarray:
        min_depth = max([np.nanmin(d) for d in all_depths])
        max_depth = min([np.nanmax(d) for d in all_depths])

        finest_resolution = min([np.nanmedian(np.abs(np.diff(d))) for d in all_depths])

        return np.arange(min_depth, max_depth + finest_resolution, finest_resolution)

    def batch_merge(
        self,
        cruises: List[CruiseData],
        grid_resolution_km: float = 0.5
    ) -> MergedDataSet:
        all_lons = []
        all_lats = []

        for cruise in cruises:
            lons, lats, _ = self.aligner.extract_station_coordinates(cruise.observations)
            all_lons.extend(lons)
            all_lats.extend(lats)

        all_lons = np.array(all_lons)
        all_lats = np.array(all_lats)

        lon_min, lon_max = np.min(all_lons), np.max(all_lons)
        lat_min, lat_max = np.min(all_lats), np.max(all_lats)

        n_lon = int((lon_max - lon_min) / (grid_resolution_km / 111) + 1)
        n_lat = int((lat_max - lat_min) / (grid_resolution_km / 111) + 1)

        lon_grid = np.linspace(lon_min, lon_max, n_lon)
        lat_grid = np.linspace(lat_min, lat_max, n_lat)

        merged_obs = []

        for i, target_lon in enumerate(lon_grid):
            for j, target_lat in enumerate(lat_grid):
                all_profiles_temp = []
                all_profiles_sal = []
                all_depths = []
                all_distances = []

                for cruise in cruises:
                    src_lons, src_lats, _ = self.aligner.extract_station_coordinates(cruise.observations)
                    nearby_indices, distances = self.aligner.find_nearby_stations(
                        target_lon, target_lat, src_lons, src_lats, self.max_distance_km
                    )

                    for idx, dist in zip(nearby_indices, distances):
                        src_obs = cruise.observations[idx]
                        all_profiles_temp.append(src_obs.temperature)
                        all_profiles_sal.append(src_obs.salinity)
                        all_depths.append(src_obs.depth)
                        all_distances.append(dist)

                if len(all_profiles_temp) > 0:
                    common_depths = self._get_common_depth_grid(all_depths)
                    aligned_temp = self.aligner.align_to_common_grid(
                        all_profiles_temp, all_depths, common_depths
                    )
                    aligned_sal = self.aligner.align_to_common_grid(
                        all_profiles_sal, all_depths, common_depths
                    )

                    distances = np.array(all_distances)
                    weights = self.aligner.calculate_spatial_weights(
                        distances, self.weighting_method, self.bandwidth
                    )

                    merged_temp = np.average(aligned_temp, weights=weights, axis=0)
                    merged_sal = np.average(aligned_sal, weights=weights, axis=0)

                    station_idx = i * len(lat_grid) + j
                    merged_obs.append(
                        OceanObservation(
                            station_id=f"GRID_{station_idx:06d}",
                            time=np.array([np.datetime64("NaT")] * len(common_depths)),
                            longitude=np.array([target_lon] * len(common_depths)),
                            latitude=np.array([target_lat] * len(common_depths)),
                            depth=common_depths,
                            temperature=merged_temp,
                            salinity=merged_sal,
                            metadata={
                                "grid_lon_idx": i,
                                "grid_lat_idx": j,
                                "n_contributing": len(all_profiles_temp),
                            }
                        )
                    )

        return MergedDataSet(
            cruises=cruises,
            merged_observations=merged_obs,
            merge_metadata={
                "max_distance_km": self.max_distance_km,
                "weighting_method": self.weighting_method,
                "bandwidth": self.bandwidth,
                "grid_resolution_km": grid_resolution_km,
                "grid_size": (len(lon_grid), len(lat_grid)),
            }
        )


class MultiCruiseAnalyzer:
    def __init__(self):
        self.profile_analyzer = ProfileAnalyzer()

    def compute_transect(
        self,
        observations: List[OceanObservation],
        along_transect_axis: str = "latitude"
    ) -> Dict[str, np.ndarray]:
        if along_transect_axis == "latitude":
            sort_idx = np.argsort([np.nanmean(obs.latitude) for obs in observations])
            axis_values = np.array([np.nanmean(observations[i].latitude) for i in sort_idx])
        else:
            sort_idx = np.argsort([np.nanmean(obs.longitude) for obs in observations])
            axis_values = np.array([np.nanmean(observations[i].longitude) for i in sort_idx])

        sorted_obs = [observations[i] for i in sort_idx]

        all_depths = [obs.depth for obs in sorted_obs]
        all_temp = [obs.temperature for obs in sorted_obs]
        all_sal = [obs.salinity for obs in sorted_obs]

        common_depths = MultiCruiseMerger._get_common_depth_grid(all_depths)

        aligned_temp = SpatioTemporalAligner.align_to_common_grid(
            all_temp, all_depths, common_depths
        )
        aligned_sal = SpatioTemporalAligner.align_to_common_grid(
            all_sal, all_depths, common_depths
        )

        return {
            "axis": along_transect_axis,
            "axis_values": axis_values,
            "depths": common_depths,
            "temperature_2d": np.array(aligned_temp).T,
            "salinity_2d": np.array(aligned_sal).T,
            "sorted_indices": sort_idx,
        }

    @staticmethod
    def compute_cruise_statistics(
        cruises: List[CruiseData]
    ) -> List[Dict[str, Any]]:
        stats = []
        for cruise in cruises:
            all_temp = np.concatenate([obs.temperature for obs in cruise.observations])
            all_sal = np.concatenate([obs.salinity for obs in cruise.observations])
            all_depth = np.concatenate([obs.depth for obs in cruise.observations])

            stats.append({
                "cruise_id": cruise.metadata.cruise_id,
                "n_stations": len(cruise.observations),
                "temperature": {
                    "mean": float(np.nanmean(all_temp)),
                    "std": float(np.nanstd(all_temp)),
                    "min": float(np.nanmin(all_temp)),
                    "max": float(np.nanmax(all_temp)),
                },
                "salinity": {
                    "mean": float(np.nanmean(all_sal)),
                    "std": float(np.nanstd(all_sal)),
                    "min": float(np.nanmin(all_sal)),
                    "max": float(np.nanmax(all_sal)),
                },
                "depth_range": [float(np.nanmin(all_depth)), float(np.nanmax(all_depth))],
            })

        return stats

    def compare_cruises(
        self,
        cruise1: CruiseData,
        cruise2: CruiseData,
        max_distance_km: float = 30.0
    ) -> Dict[str, Any]:
        aligner = SpatioTemporalAligner()

        lons1, lats1, _ = aligner.extract_station_coordinates(cruise1.observations)
        lons2, lats2, _ = aligner.extract_station_coordinates(cruise2.observations)

        matches = []
        temp_diffs = []
        sal_diffs = []

        for idx1, obs1 in enumerate(cruise1.observations):
            nearby_indices, distances = aligner.find_nearby_stations(
                lons1[idx1], lats1[idx1], lons2, lats2, max_distance_km
            )

            if len(nearby_indices) > 0:
                idx2 = nearby_indices[0]
                obs2 = cruise2.observations[idx2]

                common_depths = MultiCruiseMerger._get_common_depth_grid(
                    [obs1.depth, obs2.depth]
                )

                aligned = aligner.align_to_common_grid(
                    [obs1.temperature, obs2.temperature, obs1.salinity, obs2.salinity],
                    [obs1.depth, obs2.depth, obs1.depth, obs2.depth],
                    common_depths
                )

                temp1, temp2, sal1, sal2 = aligned[0], aligned[1], aligned[2], aligned[3]

                valid_mask = ~np.isnan(temp1) & ~np.isnan(temp2)
                if np.any(valid_mask):
                    temp_rmse = np.sqrt(np.mean((temp1[valid_mask] - temp2[valid_mask]) ** 2))
                    sal_rmse = np.sqrt(np.mean((sal1[valid_mask] - sal2[valid_mask]) ** 2))

                    matches.append({
                        "station1": obs1.station_id,
                        "station2": obs2.station_id,
                        "distance_km": distances[0],
                        "temp_rmse": float(temp_rmse),
                        "sal_rmse": float(sal_rmse),
                    })
                    temp_diffs.append(temp_rmse)
                    sal_diffs.append(sal_rmse)

        return {
            "cruise1_id": cruise1.metadata.cruise_id,
            "cruise2_id": cruise2.metadata.cruise_id,
            "n_matches": len(matches),
            "matches": matches,
            "summary": {
                "mean_temp_diff": float(np.mean(temp_diffs)) if temp_diffs else 0,
                "mean_sal_diff": float(np.mean(sal_diffs)) if sal_diffs else 0,
                "max_temp_diff": float(np.max(temp_diffs)) if temp_diffs else 0,
                "max_sal_diff": float(np.max(sal_diffs)) if sal_diffs else 0,
            }
        }


class BatchProcessor:
    def __init__(self, output_dir: str = "./batch_output"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def process_batch(
        self,
        observations: List[OceanObservation],
        batch_size: int = 10,
        processor_func: callable = None,
        **kwargs
    ) -> List[Any]:
        if processor_func is None:
            processor_func = lambda obs, **kw: obs

        results = []
        n_batches = (len(observations) + batch_size - 1) // batch_size

        logger.info(f"Processing {len(observations)} stations in {n_batches} batches")

        for i in range(n_batches):
            start_idx = i * batch_size
            end_idx = min((i + 1) * batch_size, len(observations))
            batch = observations[start_idx:end_idx]

            logger.debug(f"Processing batch {i + 1}/{n_batches}: {len(batch)} stations")

            batch_results = [processor_func(obs, **kwargs) for obs in batch]
            results.extend(batch_results)

        logger.info(f"Batch processing complete: {len(results)} results")

        return results

    def save_batch_results(
        self,
        results: List[Any],
        filename: str = "batch_results.json"
    ) -> Path:
        import json
        output_path = self.output_dir / filename

        serializable = []
        for r in results:
            if hasattr(r, 'to_dict'):
                serializable.append(r.to_dict())
            elif isinstance(r, dict):
                serializable.append(r)
            else:
                serializable.append(str(r))

        with open(output_path, 'w') as f:
            json.dump(serializable, f, indent=2, default=str)

        logger.info(f"Batch results saved to {output_path}")
        return output_path
