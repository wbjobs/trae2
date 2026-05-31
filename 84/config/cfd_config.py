from typing import Optional, Tuple, List
from dataclasses import dataclass, field
from enum import Enum
import numpy as np


class BoundaryCondition(Enum):
    PERIODIC = 'periodic'
    DIRICHLET = 'dirichlet'
    NEUMANN = 'neumann'
    NO_SLIP = 'no_slip'


class SimulationType(Enum):
    LAMINAR = 'laminar'
    TURBULENT = 'turbulent'
    DNS = 'dns'
    LES = 'les'


class PriorityLevel(Enum):
    LOW = 0
    NORMAL = 5
    HIGH = 10
    CRITICAL = 15


@dataclass
class GridConfig:
    nx: int = 256
    ny: int = 256
    lx: float = 1.0
    ly: float = 1.0
    bc_x: BoundaryCondition = BoundaryCondition.PERIODIC
    bc_y: BoundaryCondition = BoundaryCondition.PERIODIC
    overlap: int = 2

    @property
    def dx(self) -> float:
        return self.lx / self.nx

    @property
    def dy(self) -> float:
        return self.ly / self.ny

    def to_dict(self) -> dict:
        return {
            'nx': self.nx,
            'ny': self.ny,
            'lx': self.lx,
            'ly': self.ly,
            'bc_x': self.bc_x.value,
            'bc_y': self.bc_y.value,
            'overlap': self.overlap
        }


@dataclass
class SimulationConfig:
    dt: float = 0.001
    nu: float = 0.01
    rho: float = 1.0
    iterations: int = 1000
    save_interval: int = 10
    sim_type: SimulationType = SimulationType.LAMINAR
    cfl: float = 0.5
    max_velocity: float = 1.0

    def to_dict(self) -> dict:
        return {
            'dt': self.dt,
            'nu': self.nu,
            'rho': self.rho,
            'iterations': self.iterations,
            'save_interval': self.save_interval,
            'sim_type': self.sim_type.value,
            'cfl': self.cfl,
            'max_velocity': self.max_velocity
        }


@dataclass
class CFDConfig:
    grid: GridConfig = field(default_factory=GridConfig)
    sim: SimulationConfig = field(default_factory=SimulationConfig)
    priority: PriorityLevel = PriorityLevel.NORMAL
    task_id: Optional[str] = None
    name: str = 'cfd_simulation'
    num_shards: int = 4

    def to_dict(self) -> dict:
        return {
            'grid': self.grid.to_dict(),
            'sim': self.sim.to_dict(),
            'priority': self.priority.value,
            'task_id': self.task_id,
            'name': self.name,
            'num_shards': self.num_shards
        }


@dataclass
class ShardInfo:
    shard_id: int
    total_shards: int
    x_start: int
    x_end: int
    y_start: int
    y_end: int
    has_left: bool
    has_right: bool
    has_top: bool
    has_bottom: bool

    @property
    def shape(self) -> Tuple[int, int]:
        return (self.x_end - self.x_start, self.y_end - self.y_start)

    def to_dict(self) -> dict:
        return {
            'shard_id': self.shard_id,
            'total_shards': self.total_shards,
            'x_start': self.x_start,
            'x_end': self.x_end,
            'y_start': self.y_start,
            'y_end': self.y_end,
            'has_left': self.has_left,
            'has_right': self.has_right,
            'has_top': self.has_top,
            'has_bottom': self.has_bottom,
            'shape': list(self.shape)
        }
