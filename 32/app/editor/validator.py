"""Project validation: check for DMX conflicts, scene integrity, etc."""
from __future__ import annotations

from typing import Dict, List

from ..models import Project


class ProjectValidator:
    """Validates a project for common issues."""

    def __init__(self, project: Project):
        self.project = project

    def validate(self) -> List[str]:
        problems: List[str] = []
        problems.extend(self._check_dmx_conflicts())
        problems.extend(self._check_scenes())
        problems.extend(self._check_fixture_consistency())
        return problems

    def _check_dmx_conflicts(self) -> List[str]:
        problems: List[str] = []
        used_addresses: Dict[int, List[str]] = {}
        for fid, fd in self.project.fixtures.items():
            addr = fd.dmx_address
            for off in range(max(1, len(fd.channels))):
                key = addr + off
                used_addresses.setdefault(key, []).append(fid)
        for addr, owners in used_addresses.items():
            if len(owners) > 1:
                names = [self.project.fixtures[oid].name or oid for oid in owners]
                problems.append(f"DMX address {addr} conflict: {', '.join(names)}")
        return problems

    def _check_scenes(self) -> List[str]:
        problems: List[str] = []
        if not self.project.scenes:
            problems.append("Project contains no scenes")
            return problems
        sorted_scenes = sorted(self.project.scenes, key=lambda s: s.cue_time)
        for i, scene in enumerate(sorted_scenes):
            if scene.fade > scene.duration:
                problems.append(
                    f"Scene '{scene.name}' fade ({scene.fade}s) exceeds "
                    f"duration ({scene.duration}s)"
                )
            if i > 0:
                prev = sorted_scenes[i - 1]
                gap = scene.cue_time - (prev.cue_time + prev.duration)
                if gap < 0:
                    problems.append(
                        f"Scene '{scene.name}' overlaps with '{prev.name}'"
                    )
        return problems

    def _check_fixture_consistency(self) -> List[str]:
        problems: List[str] = []
        fixture_ids = set(self.project.fixtures.keys())
        for scene in self.project.scenes:
            missing = fixture_ids - set(scene.fixture_states.keys())
            if missing:
                names = [self.project.fixtures[fid].name or fid for fid in missing]
                problems.append(
                    f"Scene '{scene.name}' missing fixtures: {', '.join(names)}"
                )
            extra = set(scene.fixture_states.keys()) - fixture_ids
            if extra:
                problems.append(
                    f"Scene '{scene.name}' references deleted fixtures: {', '.join(extra)}"
                )
        return problems
