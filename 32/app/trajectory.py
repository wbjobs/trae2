"""Trajectory computation for lighting channels across scenes.

Optimized version with cached sorted keyframes, pre-computed scene lookup,
and batch sampling for better performance with large projects.

Supports interpolation modes:
    - linear      : constant velocity between scene keyframes
    - ease_in_out : smooth S-curve (smoothstep)
    - hold        : value holds until the next cue
    - bezier      : cubic bezier with custom control points
"""
from __future__ import annotations

import bisect
import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from .models import FixtureState, Project, Scene


InterpMode = str  # "linear" | "ease_in_out" | "hold" | "bezier"


@dataclass
class KeyFrame:
    __slots__ = ("t", "value", "mode", "c1", "c2")
    t: float
    value: float
    mode: InterpMode
    c1: Tuple[float, float]
    c2: Tuple[float, float]

    def __init__(self, t: float, value: float, mode: InterpMode = "linear",
                 c1: Tuple[float, float] = (0.33, 0.0),
                 c2: Tuple[float, float] = (0.67, 1.0)):
        self.t = t
        self.value = value
        self.mode = mode
        self.c1 = c1
        self.c2 = c2


@dataclass
class ChannelTrajectory:
    """Pre-sorted trajectory for a single channel."""
    __slots__ = ("fixture_id", "channel", "keyframes", "_times")
    fixture_id: str
    channel: str
    keyframes: List[KeyFrame]
    _times: List[float]

    def __init__(self, fixture_id: str, channel: str):
        self.fixture_id = fixture_id
        self.channel = channel
        self.keyframes = []
        self._times = []

    def finalize(self) -> None:
        """Sort keyframes by time and cache time values for binary search."""
        self.keyframes.sort(key=lambda k: k.t)
        self._times = [kf.t for kf in self.keyframes]

    def value_at(self, t: float) -> float:
        if not self.keyframes:
            return 0.0
        times = self._times
        if t <= times[0]:
            return self.keyframes[0].value
        if t >= times[-1]:
            return self.keyframes[-1].value
        # Binary search for the right keyframe pair
        idx = bisect.bisect_right(times, t) - 1
        a = self.keyframes[idx]
        b = self.keyframes[idx + 1]
        return _interpolate(a, b, t)


# ----------------------------------------------------------------- interpolation
def _smoothstep(x: float) -> float:
    return x * x * (3 - 2 * x)


def _cubic_bezier_y(p1: Tuple[float, float], p2: Tuple[float, float], x: float) -> float:
    """Approximate y on a unit cubic bezier for x in [0, 1]."""
    x1, y1 = p1
    x2, y2 = p2

    def xt(t: float) -> float:
        mt = 1 - t
        return 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t

    lo, hi = 0.0, 1.0
    for _ in range(12):
        mid = (lo + hi) * 0.5
        if xt(mid) < x:
            lo = mid
        else:
            hi = mid
    t = (lo + hi) * 0.5
    mt = 1 - t
    return 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t


def _interpolate(a: KeyFrame, b: KeyFrame, t: float) -> float:
    span = b.t - a.t
    if span <= 0:
        return b.value
    x = (t - a.t) / span
    mode = (a.mode or "linear").lower()
    if mode == "hold":
        return a.value
    if mode in ("ease_in_out", "smooth"):
        x = _smoothstep(x)
    elif mode == "bezier":
        x = _cubic_bezier_y(a.c1, a.c2, x)
    return a.value + (b.value - a.value) * x


# ----------------------------------------------------------------- engine
class TrajectoryEngine:
    """Builds and samples channel trajectories from an ordered scene list."""

    def __init__(self, project: Project, mode: InterpMode = "linear"):
        self.project = project
        self.mode = mode
        self.trajectories: Dict[Tuple[str, str], ChannelTrajectory] = {}
        self._sorted_scenes: List[Scene] = []
        self._scene_times: List[float] = []
        self._duration: float = 0.0

    # ---------------------------------------------------------------- build
    def build(self) -> None:
        """Build trajectories from current project state."""
        self.trajectories.clear()
        self._sorted_scenes = sorted(self.project.scenes, key=lambda s: s.cue_time)
        self._scene_times = [s.cue_time for s in self._sorted_scenes]
        self._duration = 0.0

        if not self._sorted_scenes:
            return

        # Compute total duration
        last = self._sorted_scenes[-1]
        self._duration = last.cue_time + last.duration

        # Build per-channel trajectories
        for fid, fd in self.project.fixtures.items():
            for ch in fd.channels:
                traj = ChannelTrajectory(fixture_id=fid, channel=ch)
                for sc in self._sorted_scenes:
                    state = sc.fixture_states.get(fid)
                    value = state.channels.get(ch, 0.0) if state else 0.0
                    traj.keyframes.append(KeyFrame(
                        t=sc.cue_time,
                        value=float(value),
                        mode=self.mode,
                    ))
                traj.finalize()
                self.trajectories[(fid, ch)] = traj

    # ----------------------------------------------------------- sampling
    def sample(self, t: float) -> Dict[str, FixtureState]:
        result: Dict[str, FixtureState] = {}
        for (fid, ch), traj in self.trajectories.items():
            v = traj.value_at(t)
            result.setdefault(fid, FixtureState()).channels[ch] = v
        return result

    def sample_fixture(self, fixture_id: str, t: float) -> FixtureState:
        state = FixtureState()
        for (fid, ch), traj in self.trajectories.items():
            if fid == fixture_id:
                state.channels[ch] = traj.value_at(t)
        return state.clamp()

    def sample_range(self, start: float, end: float, fps: int = 30
                     ) -> List[Tuple[float, Dict[str, FixtureState]]]:
        if fps <= 0 or end <= start:
            return []
        step = 1.0 / fps
        out: List[Tuple[float, Dict[str, FixtureState]]] = []
        t = start
        while t <= end:
            out.append((t, self.sample(t)))
            t += step
        return out

    # ----------------------------------------------------------- metadata
    def total_duration(self) -> float:
        return self._duration

    def scene_at(self, t: float) -> Optional[Scene]:
        if not self._sorted_scenes:
            return None
        times = self._scene_times
        if t < times[0]:
            return None
        if t >= times[-1]:
            return self._sorted_scenes[-1]
        idx = bisect.bisect_right(times, t) - 1
        return self._sorted_scenes[idx]

    # ----------------------------------------------------------- export
    def to_dmx_frames(self, fps: int = 30) -> List[Dict[int, int]]:
        """Render timeline into a list of DMX universes per frame."""
        if not self.trajectories or self._duration <= 0:
            return []
        step = 1.0 / fps
        out: List[Dict[int, int]] = []
        t = 0.0
        # Pre-build address mapping for fast lookup
        addr_map: Dict[str, Dict[str, int]] = {}
        for fid, fd in self.project.fixtures.items():
            addr_map[fid] = {ch: fd.dmx_address + idx
                             for idx, ch in enumerate(fd.channels)}

        while t <= self._duration:
            universe: Dict[int, int] = {}
            for (fid, ch), traj in self.trajectories.items():
                if fid in addr_map and ch in addr_map[fid]:
                    universe[addr_map[fid][ch]] = int(round(traj.value_at(t))) & 0xFF
            out.append(universe)
            t += step
        return out
