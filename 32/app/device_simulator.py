"""Device simulation and external lighting interface adapter.

The module is split into:

    * InternalSimulator  - pure Python fixture simulation, keeps channel
                            history, computes beam directions, and can export
                            snapshots of the current rig state.
    * ExternalSimulator  - pluggable adapter that talks to a remote lighting
                            simulator over TCP. The wire protocol is a simple
                            length-prefixed JSON envelope so any language can
                            implement it.
"""
from __future__ import annotations

import json
import socket
import struct
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from .models import FixtureDefinition, FixtureState, Project


@dataclass
class SimulatedFixture:
    definition: FixtureDefinition
    state: FixtureState = field(default_factory=FixtureState)
    beam_angle: float = 25.0  # degrees
    position: Tuple[float, float, float] = (0.0, 0.0, 0.0)

    @property
    def direction(self) -> Tuple[float, float, float]:
        import math
        pan = math.radians(self.state.channels.get("pan", 0.0))
        tilt = math.radians(self.state.channels.get("tilt", 0.0))
        x = math.sin(pan) * math.cos(tilt)
        y = math.sin(tilt)
        z = math.cos(pan) * math.cos(tilt)
        return (x, y, z)

    @property
    def rgb(self) -> Tuple[int, int, int]:
        r = int(self.state.channels.get("r", 0.0)) & 0xFF
        g = int(self.state.channels.get("g", 0.0)) & 0xFF
        b = int(self.state.channels.get("b", 0.0)) & 0xFF
        dimmer = self.state.channels.get("dimmer", 255.0) / 255.0
        return (int(r * dimmer), int(g * dimmer), int(b * dimmer))


class InternalSimulator:
    """Offline, in-process simulator of the current rig."""

    def __init__(self, project: Project):
        self.project = project
        self.fixtures: Dict[str, SimulatedFixture] = {}
        self.frame_count: int = 0
        self.history: List[Dict[str, FixtureState]] = []
        self.max_history: int = 1024
        self._listeners: List[Callable[[Dict[str, FixtureState]], None]] = []
        self._rebuild()

    # ------------------------------------------------------------ rig mgmt
    def _rebuild(self) -> None:
        self.fixtures.clear()
        for fid, fd in self.project.fixtures.items():
            self.fixtures[fid] = SimulatedFixture(definition=fd)

    def reload_project(self, project: Project) -> None:
        self.project = project
        self._rebuild()

    # ------------------------------------------------------------ playback
    def apply_snapshot(self, snapshot: Dict[str, FixtureState]) -> None:
        for fid, state in snapshot.items():
            sf = self.fixtures.get(fid)
            if sf is not None:
                sf.state = state.clamp()
        self.frame_count += 1
        self.history.append({fid: sf.state for fid, sf in self.fixtures.items()})
        if len(self.history) > self.max_history:
            self.history = self.history[-self.max_history:]
        for listener in list(self._listeners):
            try:
                listener(snapshot)
            except Exception:
                pass

    def register_listener(self, fn: Callable[[Dict[str, FixtureState]], None]) -> None:
        self._listeners.append(fn)

    def unregister_listener(self, fn: Callable[[Dict[str, FixtureState]], None]) -> None:
        if fn in self._listeners:
            self._listeners.remove(fn)

    # ------------------------------------------------------------ queries
    def snapshot(self) -> Dict[str, FixtureState]:
        return {fid: sf.state for fid, sf in self.fixtures.items()}

    def fixture_status(self, fixture_id: str) -> Optional[Dict[str, Any]]:
        sf = self.fixtures.get(fixture_id)
        if sf is None:
            return None
        r, g, b = sf.rgb
        dx, dy, dz = sf.direction
        return {
            "id": fixture_id,
            "name": sf.definition.name,
            "dmx": sf.definition.dmx_address,
            "rgb": (r, g, b),
            "direction": (dx, dy, dz),
            "beam_angle": sf.beam_angle,
            "channels": dict(sf.state.channels),
        }


# =================================================================== external
class ExternalSimulator:
    """Adapter that pushes rig state to an external lighting simulator.

    Wire protocol (client initiates):
        - Send: [4 BE length][JSON bytes]
        - Recv: [4 BE length][JSON bytes]

    Message shape:
        {"type": "frame", "seq": 123, "ts": 12345.678,
         "fixtures": [{"id": ..., "channels": {...}}]}
    """

    def __init__(self, host: str = "127.0.0.1", port: int = 9420,
                 timeout: float = 1.0):
        self.host = host
        self.port = port
        self.timeout = timeout
        self._sock: Optional[socket.socket] = None
        self.connected: bool = False
        self.seq: int = 0

    # ----------------------------------------------------------- connection
    def connect(self) -> bool:
        self.close()
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(self.timeout)
            sock.connect((self.host, self.port))
            self._sock = sock
            self.connected = True
            return True
        except OSError:
            self.connected = False
            return False

    def close(self) -> None:
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
            self._sock = None
        self.connected = False

    # -------------------------------------------------------------- send
    def send(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if self._sock is None:
            return None
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            self._sock.sendall(struct.pack(">I", len(body)) + body)
            length_bytes = self._recv_exact(4)
            if length_bytes is None:
                return None
            length = struct.unpack(">I", length_bytes)[0]
            data = self._recv_exact(length)
            if data is None:
                return None
            return json.loads(data.decode("utf-8"))
        except (OSError, json.JSONDecodeError):
            self.connected = False
            return None

    def _recv_exact(self, n: int) -> Optional[bytes]:
        if self._sock is None:
            return None
        data = b""
        while len(data) < n:
            try:
                chunk = self._sock.recv(n - len(data))
            except OSError:
                return None
            if not chunk:
                return None
            data += chunk
        return data

    # ------------------------------------------------------------ facade
    def send_frame(self, snapshot: Dict[str, FixtureState]) -> Optional[Dict[str, Any]]:
        self.seq += 1
        fixtures = []
        for fid, state in snapshot.items():
            fixtures.append({"id": fid, "channels": dict(state.channels)})
        return self.send({
            "type": "frame",
            "seq": self.seq,
            "ts": time.time(),
            "fixtures": fixtures,
        })

    def send_command(self, command: str, **kwargs) -> Optional[Dict[str, Any]]:
        payload = {"type": "command", "command": command}
        payload.update(kwargs)
        return self.send(payload)
