"""Data models for scenes, fixtures and project definitions."""
from __future__ import annotations

import copy
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional


@dataclass
class FixtureState:
    """Channel values for a single fixture at a given moment.

    Channel keys use a standard naming convention:
        - dimmer, r, g, b, w, a (color / intensity)
        - pan, tilt (position, degrees)
        - strobe, gobo, prism (effects, 0..255 or specialized units)
    """
    channels: Dict[str, float] = field(default_factory=dict)

    def clamp(self) -> "FixtureState":
        clamped = {}
        for k, v in self.channels.items():
            clamped[k] = max(0.0, min(255.0, float(v)))
        return FixtureState(channels=clamped)


@dataclass
class FixtureDefinition:
    """Definition of a lighting fixture in the rig."""
    id: str = ""
    name: str = ""
    dmx_address: int = 1
    channels: List[str] = field(default_factory=lambda: ["dimmer", "r", "g", "b", "pan", "tilt"])
    brand: str = ""
    model: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(data: dict) -> "FixtureDefinition":
        return FixtureDefinition(**{k: data.get(k, v) for k, v in {
            "id": "", "name": "", "dmx_address": 1, "channels": [],
            "brand": "", "model": ""
        }.items()})


@dataclass
class Scene:
    """A single lighting scene: target values per fixture plus transition."""
    id: str = ""
    name: str = "Scene"
    cue_time: float = 0.0
    duration: float = 3.0
    fade: float = 1.0
    fixture_states: Dict[str, FixtureState] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "cue_time": self.cue_time,
            "duration": self.duration,
            "fade": self.fade,
            "fixture_states": {fid: fs.channels for fid, fs in self.fixture_states.items()},
        }

    @staticmethod
    def from_dict(data: dict) -> "Scene":
        states = {}
        for fid, channels in (data.get("fixture_states") or {}).items():
            states[fid] = FixtureState(channels=channels)
        return Scene(
            id=data.get("id", ""),
            name=data.get("name", "Scene"),
            cue_time=float(data.get("cue_time", 0.0)),
            duration=float(data.get("duration", 3.0)),
            fade=float(data.get("fade", 1.0)),
            fixture_states=states,
        )


@dataclass
class Project:
    """Top-level project container: rig + scenes + metadata."""
    version: str = "1.0"
    name: str = "Untitled Project"
    fixtures: Dict[str, FixtureDefinition] = field(default_factory=dict)
    scenes: List[Scene] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "name": self.name,
            "fixtures": {fid: f.to_dict() for fid, f in self.fixtures.items()},
            "scenes": [s.to_dict() for s in self.scenes],
        }

    @staticmethod
    def from_dict(data: dict) -> "Project":
        fixtures = {}
        for fid, fd in (data.get("fixtures") or {}).items():
            fixtures[fid] = FixtureDefinition.from_dict(fd)
        scenes = [Scene.from_dict(s) for s in (data.get("scenes") or [])]
        return Project(
            version=data.get("version", "1.0"),
            name=data.get("name", "Untitled Project"),
            fixtures=fixtures,
            scenes=scenes,
        )

    def clone(self) -> "Project":
        return copy.deepcopy(self)
