"""Lighting scene editor logic.

Pure-Python editing surface that can be wired to any UI.  Handles scene CRUD,
fixture state editing, and validation. The Qt UI layer is built on top.
"""
from __future__ import annotations

import uuid
from typing import Dict, List, Optional

from .models import FixtureDefinition, FixtureState, Project, Scene


def new_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


class SceneEditor:
    """Editable facade over a Project's rig and scenes."""

    def __init__(self, project: Optional[Project] = None):
        self.project = project or Project()

    # ----------------------------------------------------------- fixtures
    def add_fixture(self, name: str, channels: Optional[List[str]] = None,
                    dmx_address: int = 1, brand: str = "", model: str = "") -> FixtureDefinition:
        fid = new_id("fx")
        fd = FixtureDefinition(
            id=fid, name=name, dmx_address=dmx_address,
            channels=channels or ["dimmer", "r", "g", "b", "pan", "tilt"],
            brand=brand, model=model,
        )
        self.project.fixtures[fid] = fd
        return fd

    def remove_fixture(self, fixture_id: str) -> bool:
        if fixture_id not in self.project.fixtures:
            return False
        del self.project.fixtures[fixture_id]
        for scene in self.project.scenes:
            scene.fixture_states.pop(fixture_id, None)
        return True

    def update_fixture(self, fixture_id: str, **kwargs) -> Optional[FixtureDefinition]:
        fd = self.project.fixtures.get(fixture_id)
        if not fd:
            return None
        for key, value in kwargs.items():
            if hasattr(fd, key):
                setattr(fd, key, value)
        return fd

    def list_fixtures(self) -> List[FixtureDefinition]:
        return list(self.project.fixtures.values())

    # ----------------------------------------------------------- scenes
    def add_scene(self, name: str = "Scene", cue_time: float = 0.0,
                  duration: float = 3.0, fade: float = 1.0) -> Scene:
        sid = new_id("sc")
        states: Dict[str, FixtureState] = {}
        for fid in self.project.fixtures:
            default_channels = {c: 0.0 for c in self.project.fixtures[fid].channels}
            states[fid] = FixtureState(channels=default_channels)
        scene = Scene(
            id=sid, name=name, cue_time=cue_time, duration=duration,
            fade=fade, fixture_states=states,
        )
        self.project.scenes.append(scene)
        return scene

    def remove_scene(self, scene_id: str) -> bool:
        for i, s in enumerate(self.project.scenes):
            if s.id == scene_id:
                self.project.scenes.pop(i)
                return True
        return False

    def get_scene(self, scene_id: str) -> Optional[Scene]:
        for s in self.project.scenes:
            if s.id == scene_id:
                return s
        return None

    def update_scene(self, scene_id: str, **kwargs) -> Optional[Scene]:
        scene = self.get_scene(scene_id)
        if not scene:
            return None
        for key, value in kwargs.items():
            if hasattr(scene, key):
                setattr(scene, key, value)
        return scene

    def reorder_scenes(self, ordered_ids: List[str]) -> None:
        lookup = {s.id: s for s in self.project.scenes}
        self.project.scenes = [lookup[sid] for sid in ordered_ids if sid in lookup]

    # ----------------------------------------------------------- fixture states
    def set_fixture_state(self, scene_id: str, fixture_id: str,
                          channels: Dict[str, float]) -> Optional[FixtureState]:
        scene = self.get_scene(scene_id)
        if not scene:
            return None
        if fixture_id not in self.project.fixtures:
            return None
        state = FixtureState(channels=dict(channels)).clamp()
        scene.fixture_states[fixture_id] = state
        return state

    def get_fixture_state(self, scene_id: str, fixture_id: str) -> Optional[FixtureState]:
        scene = self.get_scene(scene_id)
        if not scene:
            return None
        return scene.fixture_states.get(fixture_id)

    # ----------------------------------------------------------- validation
    def validate(self) -> List[str]:
        problems: List[str] = []
        used_addresses: Dict[int, List[str]] = {}
        for fid, fd in self.project.fixtures.items():
            addr = fd.dmx_address
            for off in range(max(1, len(fd.channels))):
                key = addr + off
                used_addresses.setdefault(key, []).append(fid)
        for addr, owners in used_addresses.items():
            if len(owners) > 1:
                problems.append(f"DMX address {addr} is shared by {', '.join(owners)}")
        if not self.project.scenes:
            problems.append("Project contains no scenes")
        for scene in self.project.scenes:
            if scene.fade > scene.duration:
                problems.append(
                    f"Scene '{scene.name}' fade ({scene.fade}s) exceeds "
                    f"duration ({scene.duration}s)"
                )
        return problems
