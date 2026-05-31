"""Lighting effect preset library.

Provides a collection of common lighting effect presets that can be applied
to fixtures in a scene. Each preset contains a set of channel values with
optional randomization and grouping.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

from .models import FixtureDefinition, FixtureState, Project, Scene


# Type alias for a function that generates channel values for a fixture
PresetFn = Callable[[FixtureDefinition, int, int], Dict[str, float]]


@dataclass
class PresetDefinition:
    """Definition of a lighting preset."""
    id: str
    name: str
    category: str  # "color", "position", "intensity", "effect"
    description: str = ""
    params: Dict[str, float] = field(default_factory=dict)


# Built-in presets registry
BUILTIN_PRESETS: List[PresetDefinition] = [
    PresetDefinition("warm_white", "Warm White", "color",
                     "Warm tungsten-like white",
                     {"r": 255, "g": 180, "b": 100, "dimmer": 255}),
    PresetDefinition("cool_white", "Cool White", "color",
                     "Cool daylight white",
                     {"r": 200, "g": 220, "b": 255, "dimmer": 255}),
    PresetDefinition("red", "Solid Red", "color",
                     "Full red",
                     {"r": 255, "g": 0, "b": 0, "dimmer": 255}),
    PresetDefinition("green", "Solid Green", "color",
                     "Full green",
                     {"r": 0, "g": 255, "b": 0, "dimmer": 255}),
    PresetDefinition("blue", "Solid Blue", "color",
                     "Full blue",
                     {"r": 0, "g": 0, "b": 255, "dimmer": 255}),
    PresetDefinition("amber", "Amber", "color",
                     "Amber/gold color",
                     {"r": 255, "g": 150, "b": 0, "dimmer": 255}),
    PresetDefinition("cyan", "Cyan", "color",
                     "Cyan color",
                     {"r": 0, "g": 255, "b": 255, "dimmer": 255}),
    PresetDefinition("magenta", "Magenta", "color",
                     "Magenta color",
                     {"r": 255, "g": 0, "b": 255, "dimmer": 255}),
    PresetDefinition("uv_blacklight", "UV Blacklight", "color",
                     "UV/blacklight purple",
                     {"r": 100, "g": 0, "b": 200, "dimmer": 255}),
    PresetDefinition("rainbow_static", "Rainbow (Static)", "color",
                     "Spread rainbow colors across fixtures",
                     {}),
    PresetDefinition("chase_left", "Chase Left", "effect",
                     "Left-to-right chase pattern",
                     {"step": 0.2}),
    PresetDefinition("chase_right", "Chase Right", "effect",
                     "Right-to-left chase pattern",
                     {"step": 0.2}),
    PresetDefinition("alternating", "Alternating", "effect",
                     "Every other fixture on/off",
                     {}),
    PresetDefinition("center_out", "Center Out", "effect",
                     "Expand from center outward",
                     {"step": 0.15}),
    PresetDefinition("outside_in", "Outside In", "effect",
                     "Collapse from edges to center",
                     {"step": 0.15}),
    PresetDefinition("random_colors", "Random Colors", "effect",
                     "Random colors per fixture",
                     {}),
    PresetDefinition("strobe_slow", "Strobe (Slow)", "effect",
                     "Slow strobing effect",
                     {"rate": 4}),
    PresetDefinition("strobe_fast", "Strobe (Fast)", "effect",
                     "Fast strobing effect",
                     {"rate": 12}),
    PresetDefinition("pan_sweep", "Pan Sweep", "position",
                     "Horizontal pan sweep",
                     {"amplitude": 127}),
    PresetDefinition("tilt_sweep", "Tilt Sweep", "position",
                     "Vertical tilt sweep",
                     {"amplitude": 127}),
    PresetDefinition("full_on", "Full On", "intensity",
                     "All channels at maximum",
                     {"dimmer": 255}),
    PresetDefinition("blackout", "Blackout", "intensity",
                     "All channels at zero",
                     {"dimmer": 0}),
    PresetDefinition("half_dimmer", "Half Brightness", "intensity",
                     "50% dimmer",
                     {"dimmer": 128}),
]


class PresetLibrary:
    """Manages and applies lighting presets to fixtures and scenes."""

    def __init__(self, project: Project):
        self.project = project
        self.custom_presets: Dict[str, PresetDefinition] = {}

    # ----------------------------------------------------------- registry
    def list_presets(self) -> List[PresetDefinition]:
        return list(BUILTIN_PRESETS) + list(self.custom_presets.values())

    def list_by_category(self, category: str) -> List[PresetDefinition]:
        return [p for p in self.list_presets() if p.category == category]

    def get_preset(self, preset_id: str) -> Optional[PresetDefinition]:
        for p in BUILTIN_PRESETS:
            if p.id == preset_id:
                return p
        return self.custom_presets.get(preset_id)

    def add_custom(self, preset: PresetDefinition) -> None:
        self.custom_presets[preset.id] = preset

    def remove_custom(self, preset_id: str) -> bool:
        return self.custom_presets.pop(preset_id, None) is not None

    # ----------------------------------------------------------- apply
    def apply_to_scene(self, preset_id: str, scene: Scene,
                       fixture_ids: Optional[List[str]] = None,
                       intensity: float = 1.0,
                       random_seed: Optional[int] = None) -> Scene:
        """Apply a preset to specific fixtures (or all) in a scene."""
        preset = self.get_preset(preset_id)
        if preset is None:
            return scene

        rng = random.Random(random_seed) if random_seed is not None else random.Random()

        if fixture_ids is None:
            fixture_ids = list(self.project.fixtures.keys())

        fixture_list = [self.project.fixtures[fid] for fid in fixture_ids
                        if fid in self.project.fixtures]

        for i, fd in enumerate(fixture_list):
            channels = self._generate_channels(preset, fd, i, len(fixture_list),
                                               intensity, rng)
            if fd.id in scene.fixture_states:
                scene.fixture_states[fd.id].channels.update(channels)
            else:
                scene.fixture_states[fd.id] = FixtureState(channels=channels)

        return scene

    def apply_to_new_scene(self, preset_id: str, name: str = "",
                           fixture_ids: Optional[List[str]] = None,
                           cue_time: float = 0.0, duration: float = 3.0,
                           fade: float = 1.0, intensity: float = 1.0,
                           random_seed: Optional[int] = None) -> Scene:
        """Create a new scene and apply a preset to it."""
        preset = self.get_preset(preset_id)
        scene_name = name or (preset.name if preset else "Scene")
        scene = Scene(
            id=f"sc_{random.randint(0, 0xFFFFFFFF):08x}",
            name=scene_name,
            cue_time=cue_time,
            duration=duration,
            fade=fade,
            fixture_states={},
        )
        return self.apply_to_scene(preset_id, scene, fixture_ids, intensity, random_seed)

    def _generate_channels(self, preset: PresetDefinition, fd: FixtureDefinition,
                           index: int, total: int, intensity: float,
                           rng: random.Random) -> Dict[str, float]:
        """Generate channel values for a fixture based on the preset."""
        channels: Dict[str, float] = {}

        # Static color presets
        if preset.params:
            for ch, value in preset.params.items():
                if ch in fd.channels:
                    channels[ch] = value * intensity

        # Special presets
        if preset.id == "rainbow_static":
            hue = (index / max(1, total)) * 360.0
            r, g, b = _hsl_to_rgb(hue, 1.0, 0.5)
            channels.update({"r": r * intensity, "g": g * intensity, "b": b * intensity})
            if "dimmer" in fd.channels:
                channels["dimmer"] = 255 * intensity

        elif preset.id == "alternating":
            if index % 2 == 0:
                for ch in fd.channels:
                    channels[ch] = 255 * intensity if ch in ("r", "g", "b", "dimmer") else 0
            else:
                for ch in fd.channels:
                    channels[ch] = 0

        elif preset.id == "random_colors":
            for ch in fd.channels:
                if ch in ("r", "g", "b"):
                    channels[ch] = rng.uniform(0, 255) * intensity
                elif ch == "dimmer":
                    channels[ch] = 255 * intensity

        elif preset.id in ("strobe_slow", "strobe_fast"):
            rate = preset.params.get("rate", 4)
            # Simple strobe: use strobe channel if available
            if "strobe" in fd.channels:
                channels["strobe"] = min(255, rate * 20)
            # Keep dimmer on
            if "dimmer" in fd.channels:
                channels["dimmer"] = 255 * intensity

        elif preset.id == "chase_left":
            step = preset.params.get("step", 0.2)
            phase = (index / max(1, total)) * step * 10
            val = 255 * intensity if (phase < 0.5) else 0
            for ch in ("r", "g", "b", "dimmer"):
                if ch in fd.channels:
                    channels[ch] = val

        elif preset.id == "chase_right":
            step = preset.params.get("step", 0.2)
            phase = ((total - 1 - index) / max(1, total)) * step * 10
            val = 255 * intensity if (phase < 0.5) else 0
            for ch in ("r", "g", "b", "dimmer"):
                if ch in fd.channels:
                    channels[ch] = val

        elif preset.id == "center_out":
            step = preset.params.get("step", 0.15)
            center = (total - 1) / 2.0
            distance = abs(index - center)
            val = max(0, 255 * intensity * (1.0 - distance * step * 2))
            for ch in ("r", "g", "b", "dimmer"):
                if ch in fd.channels:
                    channels[ch] = val

        elif preset.id == "outside_in":
            step = preset.params.get("step", 0.15)
            center = (total - 1) / 2.0
            distance = abs(index - center)
            max_dist = max(1, center)
            val = max(0, 255 * intensity * (distance / max_dist))
            for ch in ("r", "g", "b", "dimmer"):
                if ch in fd.channels:
                    channels[ch] = val

        elif preset.id in ("pan_sweep", "tilt_sweep"):
            amp = preset.params.get("amplitude", 127)
            if preset.id == "pan_sweep" and "pan" in fd.channels:
                channels["pan"] = 128 + amp * math.sin(2 * math.pi * index / max(1, total))
            if preset.id == "tilt_sweep" and "tilt" in fd.channels:
                channels["tilt"] = 128 + amp * math.sin(2 * math.pi * index / max(1, total))

        elif preset.id == "blackout":
            for ch in fd.channels:
                channels[ch] = 0

        elif preset.id == "full_on":
            for ch in fd.channels:
                channels[ch] = 255 * intensity

        return channels


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
