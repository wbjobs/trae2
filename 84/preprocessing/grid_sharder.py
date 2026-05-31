from typing import List, Tuple, Dict, Optional
import numpy as np
from config import GridConfig, ShardInfo


def get_shard_boundaries(total_size: int, num_shards: int, overlap: int = 2) -> List[Tuple[int, int]]:
    base_size = total_size // num_shards
    remainder = total_size % num_shards
    boundaries = []
    current = 0
    for i in range(num_shards):
        shard_size = base_size + (1 if i < remainder else 0)
        start = current
        end = current + shard_size
        boundaries.append((start, end))
        current = end
    return boundaries


def create_shards(grid_config: GridConfig, num_shards: int) -> List[ShardInfo]:
    if num_shards <= 0:
        raise ValueError(f"Number of shards must be positive, got {num_shards}")
    if num_shards == 1:
        return [ShardInfo(
            shard_id=0,
            total_shards=1,
            x_start=0,
            x_end=grid_config.nx,
            y_start=0,
            y_end=grid_config.ny,
            has_left=False,
            has_right=False,
            has_top=False,
            has_bottom=False
        )]
    x_boundaries = get_shard_boundaries(grid_config.nx, num_shards, grid_config.overlap)
    overlap = grid_config.overlap
    shards = []
    for i, (x_start, x_end) in enumerate(x_boundaries):
        x_start_internal = max(0, x_start - overlap if i > 0 else x_start)
        x_end_internal = min(grid_config.nx, x_end + overlap if i < num_shards - 1 else x_end)
        y_start_internal = max(0, 0 - overlap)
        y_end_internal = min(grid_config.ny, grid_config.ny + overlap)
        shard = ShardInfo(
            shard_id=i,
            total_shards=num_shards,
            x_start=x_start_internal,
            x_end=x_end_internal,
            y_start=y_start_internal,
            y_end=y_end_internal,
            has_left=(i > 0),
            has_right=(i < num_shards - 1),
            has_top=False,
            has_bottom=False
        )
        shards.append(shard)
    return shards


def extract_shard_data(data: np.ndarray, shard: ShardInfo) -> np.ndarray:
    if data.ndim == 2:
        return data[shard.x_start:shard.x_end, shard.y_start:shard.y_end].copy()
    elif data.ndim == 3:
        return data[:, shard.x_start:shard.x_end, shard.y_start:shard.y_end].copy()
    else:
        raise ValueError(f"Unsupported data dimension: {data.ndim}")


def merge_shard_data(shard_datas: List[Tuple[ShardInfo, np.ndarray]], 
                     grid_config: GridConfig) -> np.ndarray:
    if not shard_datas:
        raise ValueError("No shard data provided for merging")
    first_shard, first_data = shard_datas[0]
    if first_data.ndim == 2:
        full_data = np.zeros((grid_config.nx, grid_config.ny), dtype=first_data.dtype)
    elif first_data.ndim == 3:
        full_data = np.zeros((first_data.shape[0], grid_config.nx, grid_config.ny), 
                           dtype=first_data.dtype)
    else:
        raise ValueError(f"Unsupported data dimension: {first_data.ndim}")
    overlap = grid_config.overlap
    for shard, data in shard_datas:
        orig_x_start = shard.x_start + (overlap if shard.has_left else 0)
        orig_x_end = shard.x_end - (overlap if shard.has_right else 0)
        data_x_start = (overlap if shard.has_left else 0)
        data_x_end = data.shape[-2] - (overlap if shard.has_right else 0)
        if data.ndim == 2:
            full_data[orig_x_start:orig_x_end, :] = data[data_x_start:data_x_end, :]
        else:
            full_data[:, orig_x_start:orig_x_end, :] = data[:, data_x_start:data_x_end, :]
    return full_data


def exchange_halos(current_data: np.ndarray, neighbor_data: Optional[np.ndarray], 
                   direction: str, overlap: int = 2) -> np.ndarray:
    result = current_data.copy()
    if neighbor_data is None:
        return result
    if direction == 'left':
        if result.ndim == 2:
            result[:overlap, :] = neighbor_data[-2*overlap:-overlap, :]
        else:
            result[:, :overlap, :] = neighbor_data[:, -2*overlap:-overlap, :]
    elif direction == 'right':
        if result.ndim == 2:
            result[-overlap:, :] = neighbor_data[overlap:2*overlap, :]
        else:
            result[:, -overlap:, :] = neighbor_data[:, overlap:2*overlap, :]
    elif direction == 'bottom':
        if result.ndim == 2:
            result[:, :overlap] = neighbor_data[:, -2*overlap:-overlap]
        else:
            result[:, :, :overlap] = neighbor_data[:, :, -2*overlap:-overlap]
    elif direction == 'top':
        if result.ndim == 2:
            result[:, -overlap:] = neighbor_data[:, overlap:2*overlap]
        else:
            result[:, :, -overlap:] = neighbor_data[:, :, overlap:2*overlap]
    return result


class GridSharder:
    def __init__(self, grid_config: GridConfig, num_shards: int):
        self.grid_config = grid_config
        self.num_shards = num_shards
        self.shards = create_shards(grid_config, num_shards)
    
    def split(self, data: np.ndarray) -> List[Tuple[ShardInfo, np.ndarray]]:
        return [(shard, extract_shard_data(data, shard)) for shard in self.shards]
    
    def merge(self, shard_datas: List[Tuple[ShardInfo, np.ndarray]]) -> np.ndarray:
        return merge_shard_data(shard_datas, self.grid_config)
    
    def get_shard(self, shard_id: int) -> ShardInfo:
        for shard in self.shards:
            if shard.shard_id == shard_id:
                return shard
        raise ValueError(f"Shard {shard_id} not found")
    
    def neighbor_halo_exchange(self, shard_datas: Dict[int, np.ndarray]) -> Dict[int, np.ndarray]:
        overlap = self.grid_config.overlap
        results = {}
        for shard_id, data in shard_datas.items():
            shard = self.get_shard(shard_id)
            updated = data.copy()
            if shard.has_left and (shard_id - 1) in shard_datas:
                updated = exchange_halos(updated, shard_datas[shard_id - 1], 'left', overlap)
            if shard.has_right and (shard_id + 1) in shard_datas:
                updated = exchange_halos(updated, shard_datas[shard_id + 1], 'right', overlap)
            results[shard_id] = updated
        return results

    def exchange_halos(self, shard_list: List[Tuple[ShardInfo, np.ndarray]]) -> List[Tuple[ShardInfo, np.ndarray]]:
        shard_datas = {shard.shard_id: data for shard, data in shard_list}
        exchanged = self.neighbor_halo_exchange(shard_datas)
        return [(shard, exchanged[shard.shard_id]) for shard, _ in shard_list]
