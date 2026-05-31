"""Fixture (rig) management: add/remove/update fixtures in the project."""
from __future__ import annotations

import uuid
from typing import List, Optional

from ..models import FixtureDefinition, Project


def new_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


class FixtureManager:
    """Manages the rig (fixture inventory) of a project."""

    def __init__(self, project: Project):
        self.project = project

    def add(self, name: str, channels: Optional[List[str]] = None,
            dmx_address: int = 1, brand: str = "", model: str = "") -> FixtureDefinition:
        fid = new_id("fx")
        fd = FixtureDefinition(
            id=fid, name=name, dmx_address=dmx_address,
            channels=channels or ["dimmer", "r", "g", "b", "pan", "tilt"],
            brand=brand, model=model,
        )
        self.project.fixtures[fid] = fd
        return fd

    def remove(self, fixture_id: str) -> bool:
        if fixture_id not in self.project.fixtures:
            return False
        del self.project.fixtures[fixture_id]
        for scene in self.project.scenes:
            scene.fixture_states.pop(fixture_id, None)
        return True

    def update(self, fixture_id: str, **kwargs) -> Optional[FixtureDefinition]:
        fd = self.project.fixtures.get(fixture_id)
        if not fd:
            return None
        for key, value in kwargs.items():
            if hasattr(fd, key):
                setattr(fd, key, value)
        return fd

    def list_all(self) -> List[FixtureDefinition]:
        return list(self.project.fixtures.values())

    def find_by_address(self, dmx_address: int) -> List[FixtureDefinition]:
        return [fd for fd in self.project.fixtures.values()
                if fd.dmx_address == dmx_address]

    def next_free_address(self) -> int:
        """Find the lowest DMX address not currently in use."""
        used: set[int] = set()
        for fd in self.project.fixtures.values():
            for off in range(max(1, len(fd.channels))):
                used.add(fd.dmx_address + off)
        addr = 1
        while addr in used:
            addr += 1
        return addr
