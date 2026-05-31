"""Lighting scene editor - composed from focused sub-modules.

This module provides the same public API as the original SceneEditor but
delegates to FixtureManager, SceneManager, and ProjectValidator.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from ..models import FixtureDefinition, FixtureState, Project, Scene
from .fixture_manager import FixtureManager
from .scene_manager import SceneManager
from .validator import ProjectValidator


class SceneEditor:
    """Editable facade over a Project's rig and scenes."""

    def __init__(self, project: Optional[Project] = None):
        self.project = project or Project()
        self.fixtures = FixtureManager(self.project)
        self.scenes = SceneManager(self.project)
        self.validator = ProjectValidator(self.project)

    # ----------------------------------------------------------- fixtures
    def add_fixture(self, name: str, channels: Optional[List[str]] = None,
                    dmx_address: int = 1, brand: str = "", model: str = "") -> FixtureDefinition:
        return self.fixtures.add(name, channels, dmx_address, brand, model)

    def remove_fixture(self, fixture_id: str) -> bool:
        return self.fixtures.remove(fixture_id)

    def update_fixture(self, fixture_id: str, **kwargs) -> Optional[FixtureDefinition]:
        return self.fixtures.update(fixture_id, **kwargs)

    def list_fixtures(self) -> List[FixtureDefinition]:
        return self.fixtures.list_all()

    # ----------------------------------------------------------- scenes
    def add_scene(self, name: str = "Scene", cue_time: float = 0.0,
                  duration: float = 3.0, fade: float = 1.0) -> Scene:
        return self.scenes.add(name, cue_time, duration, fade)

    def remove_scene(self, scene_id: str) -> bool:
        return self.scenes.remove(scene_id)

    def get_scene(self, scene_id: str) -> Optional[Scene]:
        return self.scenes.get(scene_id)

    def update_scene(self, scene_id: str, **kwargs) -> Optional[Scene]:
        return self.scenes.update(scene_id, **kwargs)

    def reorder_scenes(self, ordered_ids: List[str]) -> None:
        self.scenes.reorder(ordered_ids)

    # ----------------------------------------------------------- fixture states
    def set_fixture_state(self, scene_id: str, fixture_id: str,
                          channels: Dict[str, float]) -> Optional[FixtureState]:
        return self.scenes.set_fixture_state(scene_id, fixture_id, channels)

    def get_fixture_state(self, scene_id: str, fixture_id: str) -> Optional[FixtureState]:
        return self.scenes.get_fixture_state(scene_id, fixture_id)

    # ----------------------------------------------------------- validation
    def validate(self) -> List[str]:
        return self.validator.validate()
