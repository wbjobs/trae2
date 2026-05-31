"""Scene management: add/remove/update scenes and fixture states."""
from __future__ import annotations

from typing import Dict, List, Optional

from .fixture_manager import new_id
from ..models import FixtureState, Project, Scene


class SceneManager:
    """Manages scenes (cues) and per-fixture channel values within scenes."""

    def __init__(self, project: Project):
        self.project = project

    def add(self, name: str = "Scene", cue_time: float = 0.0,
            duration: float = 3.0, fade: float = 1.0) -> Scene:
        sid = new_id("sc")
        states: Dict[str, FixtureState] = {}
        for fid, fd in self.project.fixtures.items():
            default_channels = {c: 0.0 for c in fd.channels}
            states[fid] = FixtureState(channels=default_channels)
        scene = Scene(
            id=sid, name=name, cue_time=cue_time, duration=duration,
            fade=fade, fixture_states=states,
        )
        self.project.scenes.append(scene)
        return scene

    def remove(self, scene_id: str) -> bool:
        for i, s in enumerate(self.project.scenes):
            if s.id == scene_id:
                self.project.scenes.pop(i)
                return True
        return False

    def get(self, scene_id: str) -> Optional[Scene]:
        for s in self.project.scenes:
            if s.id == scene_id:
                return s
        return None

    def update(self, scene_id: str, **kwargs) -> Optional[Scene]:
        scene = self.get(scene_id)
        if not scene:
            return None
        for key, value in kwargs.items():
            if hasattr(scene, key):
                setattr(scene, key, value)
        return scene

    def reorder(self, ordered_ids: List[str]) -> None:
        lookup = {s.id: s for s in self.project.scenes}
        self.project.scenes = [lookup[sid] for sid in ordered_ids if sid in lookup]

    def list_all(self) -> List[Scene]:
        return list(self.project.scenes)

    def list_sorted(self) -> List[Scene]:
        return sorted(self.project.scenes, key=lambda s: s.cue_time)

    def count(self) -> int:
        return len(self.project.scenes)

    # ----------------------------------------------------------- fixture states
    def set_fixture_state(self, scene_id: str, fixture_id: str,
                          channels: Dict[str, float]) -> Optional[FixtureState]:
        scene = self.get(scene_id)
        if not scene:
            return None
        if fixture_id not in self.project.fixtures:
            return None
        state = FixtureState(channels=dict(channels)).clamp()
        scene.fixture_states[fixture_id] = state
        return state

    def get_fixture_state(self, scene_id: str, fixture_id: str) -> Optional[FixtureState]:
        scene = self.get(scene_id)
        if not scene:
            return None
        return scene.fixture_states.get(fixture_id)

    def set_channel(self, scene_id: str, fixture_id: str,
                    channel: str, value: float) -> Optional[FixtureState]:
        state = self.get_fixture_state(scene_id, fixture_id)
        if state is None:
            return None
        state.channels[channel] = max(0.0, min(255.0, float(value)))
        return self.set_fixture_state(scene_id, fixture_id, state.channels)

    def get_channel(self, scene_id: str, fixture_id: str, channel: str) -> float:
        state = self.get_fixture_state(scene_id, fixture_id)
        if state is None:
            return 0.0
        return state.channels.get(channel, 0.0)

    def copy_state(self, source_scene_id: str, target_scene_id: str,
                   fixture_id: Optional[str] = None) -> bool:
        """Copy fixture states from one scene to another."""
        src = self.get(source_scene_id)
        tgt = self.get(target_scene_id)
        if not src or not tgt:
            return False
        if fixture_id:
            if fixture_id in src.fixture_states:
                tgt.fixture_states[fixture_id] = FixtureState(
                    channels=dict(src.fixture_states[fixture_id].channels)
                )
        else:
            for fid, state in src.fixture_states.items():
                tgt.fixture_states[fid] = FixtureState(
                    channels=dict(state.channels)
                )
        return True

    def ensure_fixture_in_all_scenes(self, fixture_id: str) -> None:
        """Ensure a fixture has an entry in every scene."""
        fd = self.project.fixtures.get(fixture_id)
        if not fd:
            return
        default_channels = {c: 0.0 for c in fd.channels}
        for scene in self.project.scenes:
            if fixture_id not in scene.fixture_states:
                scene.fixture_states[fixture_id] = FixtureState(
                    channels=dict(default_channels)
                )
