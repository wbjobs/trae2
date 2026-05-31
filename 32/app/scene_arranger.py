"""Scene arranger: one-click scene arrangement with multiple strategies.

Provides automated scene arrangement features:
- Randomize: Randomize fixture states across scenes
- Sequence: Arrange scenes in sequence with gradual transitions
- Wave: Create wave patterns across fixtures
- Gradient: Color gradients across scenes
- Chase: Chase patterns across scenes
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from .models import FixtureState, Project, Scene
from .preset_library import PresetLibrary


@dataclass
class ArrangeStrategy:
    """Configuration for a scene arrangement operation."""
    mode: str  # "randomize", "sequence", "wave", "gradient", "chase"
    scene_count: int = 4
    duration_per_scene: float = 3.0
    fade: float = 1.0
    intensity: float = 1.0
    start_cue_time: float = 0.0
    random_seed: Optional[int] = None


class SceneArranger:
    """Generates and arranges scenes with various strategies."""

    def __init__(self, project: Project):
        self.project = project
        self.presets = PresetLibrary(project)

    # ----------------------------------------------------------- strategies
    def auto_arrange(self, strategy: ArrangeStrategy) -> List[Scene]:
        """Generate scenes using the specified strategy."""
        mode = strategy.mode.lower()
        if mode == "randomize":
            return self._randomize(strategy)
        elif mode == "sequence":
            return self._sequence(strategy)
        elif mode == "wave":
            return self._wave(strategy)
        elif mode == "gradient":
            return self._gradient(strategy)
        elif mode == "chase":
            return self._chase(strategy)
        else:
            raise ValueError(f"Unknown arrange mode: {strategy.mode}")

    def _randomize(self, strategy: ArrangeStrategy) -> List[Scene]:
        """Create scenes with random fixture states."""
        rng = random.Random(strategy.random_seed)
        scenes = []
        for i in range(strategy.scene_count):
            scene = Scene(
                id=f"sc_rand_{i:04d}",
                name=f"Random {i + 1}",
                cue_time=strategy.start_cue_time + i * strategy.duration_per_scene,
                duration=strategy.duration_per_scene,
                fade=strategy.fade,
                fixture_states={},
            )
            for fid, fd in self.project.fixtures.items():
                channels = {}
                for ch in fd.channels:
                    if ch in ("r", "g", "b"):
                        channels[ch] = rng.uniform(0, 255) * strategy.intensity
                    elif ch == "dimmer":
                        channels[ch] = rng.uniform(100, 255) * strategy.intensity
                    elif ch in ("pan", "tilt"):
                        channels[ch] = rng.uniform(0, 255)
                    else:
                        channels[ch] = 0
                scene.fixture_states[fid] = FixtureState(channels=channels)
            scenes.append(scene)
        return scenes

    def _sequence(self, strategy: ArrangeStrategy) -> List[Scene]:
        """Create scenes that sequence through preset colors."""
        colors = [
            {"r": 255, "g": 0, "b": 0},      # Red
            {"r": 255, "g": 128, "b": 0},    # Orange
            {"r": 255, "g": 255, "b": 0},      # Yellow
            {"r": 0, "g": 255, "b": 0},      # Green
            {"r": 0, "g": 0, "b": 255},      # Blue
            {"r": 128, "g": 0, "b": 255},      # Purple
        ]
        scenes = []
        for i in range(strategy.scene_count):
            color = colors[i % len(colors)]
            scene = Scene(
                id=f"sc_seq_{i:04d}",
                name=f"Sequence {i + 1}",
                cue_time=strategy.start_cue_time + i * strategy.duration_per_scene,
                duration=strategy.duration_per_scene,
                fade=strategy.fade,
                fixture_states={},
            )
            for fid, fd in self.project.fixtures.items():
                channels = {}
                for ch in fd.channels:
                    if ch in color:
                        channels[ch] = color[ch] * strategy.intensity
                    elif ch == "dimmer":
                        channels[ch] = 255 * strategy.intensity
                    else:
                        channels[ch] = 0
                scene.fixture_states[fid] = FixtureState(channels=channels)
            scenes.append(scene)
        return scenes

    def _wave(self, strategy: ArrangeStrategy) -> List[Scene]:
        """Create scenes with wave patterns across fixtures."""
        scenes = []
        fixture_list = list(self.project.fixtures.items())
        for i in range(strategy.scene_count):
            scene = Scene(
                id=f"sc_wave_{i:04d}",
                name=f"Wave {i + 1}",
                cue_time=strategy.start_cue_time + i * strategy.duration_per_scene,
                duration=strategy.duration_per_scene,
                fade=strategy.fade,
                fixture_states={},
            )
            phase = (i / max(1, strategy.scene_count - 1)) * math.pi * 2
            for j, (fid, fd) in enumerate(fixture_list):
                channels = {}
                # Create a wave across fixtures
                pos = (j / max(1, len(fixture_list) - 1)) * math.pi * 2
                for ch in fd.channels:
                    if ch in ("r", "g", "b"):
                        val = 128 + 127 * math.sin(pos + phase)
                        channels[ch] = val * strategy.intensity
                    elif ch == "dimmer":
                        val = 128 + 127 * math.sin(pos + phase)
                        channels[ch] = max(0, val) * strategy.intensity
                    elif ch in ("pan", "tilt"):
                        channels[ch] = 128 + 64 * math.sin(pos + phase)
                    else:
                        channels[ch] = 0
                scene.fixture_states[fid] = FixtureState(channels=channels)
            scenes.append(scene)
        return scenes

    def _gradient(self, strategy: ArrangeStrategy) -> List[Scene]:
        """Create scenes with color gradients."""
        scenes = []
        for i in range(strategy.scene_count):
            t = i / max(1, strategy.scene_count - 1)
            # Interpolate hue from 0 to 360 degrees
            r, g, b = _hsl_to_rgb(t * 360, 1.0, 0.5)
            scene = Scene(
                id=f"sc_grad_{i:04d}",
                name=f"Gradient {i + 1}",
                cue_time=strategy.start_cue_time + i * strategy.duration_per_scene,
                duration=strategy.duration_per_scene,
                fade=strategy.fade,
                fixture_states={},
            )
            for fid, fd in self.project.fixtures.items():
                channels = {}
                for ch in fd.channels:
                    if ch == "r":
                        channels[ch] = r * strategy.intensity
                    elif ch == "g":
                        channels[ch] = g * strategy.intensity
                    elif ch == "b":
                        channels[ch] = b * strategy.intensity
                    elif ch == "dimmer":
                        channels[ch] = 255 * strategy.intensity
                    else:
                        channels[ch] = 0
                scene.fixture_states[fid] = FixtureState(channels=channels)
            scenes.append(scene)
        return scenes

    def _chase(self, strategy: ArrangeStrategy) -> List[Scene]:
        """Create scenes with chase patterns."""
        scenes = []
        fixture_list = list(self.project.fixtures.items())
        for i in range(strategy.scene_count):
            scene = Scene(
                id=f"sc_chase_{i:04d}",
                name=f"Chase {i + 1}",
                cue_time=strategy.start_cue_time + i * strategy.duration_per_scene,
                duration=strategy.duration_per_scene,
                fade=strategy.fade,
                fixture_states={},
            )
            active_idx = i % len(fixture_list) if fixture_list else 0
            for j, (fid, fd) in enumerate(fixture_list):
                channels = {}
                is_active = (j == active_idx)
                for ch in fd.channels:
                    if is_active:
                        if ch in ("r", "g", "b", "dimmer"):
                            channels[ch] = 255 * strategy.intensity
                        elif ch in ("pan", "tilt"):
                            channels[ch] = 128
                        else:
                            channels[ch] = 0
                    else:
                        channels[ch] = 0
                scene.fixture_states[fid] = FixtureState(channels=channels)
            scenes.append(scene)
        return scenes

    # ----------------------------------------------------------- convenience
    def apply_and_insert(self, strategy: ArrangeStrategy, replace: bool = False) -> List[Scene]:
        """Generate scenes and add them to the project.
        If replace is True, replace existing scenes."""
        new_scenes = self.auto_arrange(strategy)
        if replace:
            self.project.scenes = new_scenes
        else:
            self.project.scenes.extend(new_scenes)
        return new_scenes


def _hsl_to_rgb(h: float, s: float, l: float) -> Tuple[float, float, float]:
    """Convert HSL to RGB (h in degrees, s/l in [0,1], returns [0,255] components)."""
    h = h % 360.0
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60.0) % 2 - 1))
    m = l - c / 2

    if h < 60:
        r1, g1, b1 = c, x, 0
    elif h < 120:
        r1, g1, b1 = x, c, 0
    elif h < 180:
        r1, g1, b1 = 0, c, x
    elif h < 240:
        r1, g1, b1 = 0, x, c
    elif h < 300:
        r1, g1, b1 = x, 0, c
    else:
        r1, g1, b1 = c, 0, x

    return ((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255)
