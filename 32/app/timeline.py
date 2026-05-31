"""Timeline control: playback over the trajectory engine.

The TimelineController is the glue that connects:
    - TrajectoryEngine (computes channel values at time t)
    - InternalSimulator (offline rig simulation)
    - ExternalSimulator (push frames to a remote simulator)

It supports play / pause / stop / seek / jump-to-scene, variable speed, and
a callback system so the UI layer can subscribe to frame updates.

Playback timing uses a high-precision monotonic clock with drift correction:
    - Each frame's target time is computed from a base start time
    - If we fall behind by more than 2 frames, we skip rendering catch-up frames
    - Sleep is replaced with a short spin-wait for sub-millisecond precision
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Callable, List, Optional

from .device_simulator import ExternalSimulator, InternalSimulator
from .trajectory import TrajectoryEngine


@dataclass
class TimelineState:
    playing: bool = False
    time: float = 0.0
    fps: int = 30
    speed: float = 1.0
    loop: bool = False
    current_scene_id: Optional[str] = None


class TimelineController:
    """Drive playback and feed frames into simulators."""

    def __init__(self, engine: TrajectoryEngine,
                 simulator: InternalSimulator,
                 external: Optional[ExternalSimulator] = None,
                 fps: int = 30):
        self.engine = engine
        self.simulator = simulator
        self.external = external
        self.state = TimelineState(fps=fps)
        self._lock = threading.RLock()
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._listeners: List[Callable[[TimelineState], None]] = []
        self._ui_update_interval: int = 2  # Update UI every N frames (reduce overhead)
        self._start_monotonic: float = 0.0  # Base time for drift correction

    # ----------------------------------------------------------- listeners
    def add_listener(self, fn: Callable[[TimelineState], None]) -> None:
        self._listeners.append(fn)

    def remove_listener(self, fn: Callable[[TimelineState], None]) -> None:
        if fn in self._listeners:
            self._listeners.remove(fn)

    def _emit(self, force: bool = False) -> None:
        snapshot = TimelineState(
            playing=self.state.playing,
            time=self.state.time,
            fps=self.state.fps,
            speed=self.state.speed,
            loop=self.state.loop,
            current_scene_id=self.state.current_scene_id,
        )
        for fn in list(self._listeners):
            try:
                fn(snapshot)
            except Exception:
                pass

    # ----------------------------------------------------------- control
    def play(self) -> None:
        with self._lock:
            if self.state.playing:
                return
            self.state.playing = True
            self._stop_event.clear()
            self._start_monotonic = time.monotonic() - self.state.time / max(0.01, self.state.speed)
            self._thread = threading.Thread(target=self._run_playback, daemon=True)
            self._thread.start()
        self._emit(force=True)

    def pause(self) -> None:
        with self._lock:
            self.state.playing = False
            self._stop_event.set()
        self._emit(force=True)

    def stop(self) -> None:
        with self._lock:
            self.state.playing = False
            self._stop_event.set()
            self.state.time = 0.0
            self.state.current_scene_id = None
        self._emit(force=True)

    def seek(self, t: float) -> None:
        with self._lock:
            duration = self.engine.total_duration()
            t = max(0.0, min(duration, t))
            self.state.time = t
            if self.state.playing:
                self._start_monotonic = time.monotonic() - t / max(0.01, self.state.speed)
            self._advance_scene()
            snapshot = self.engine.sample(t)
            self.simulator.apply_snapshot(snapshot)
        self._emit(force=True)

    def set_speed(self, speed: float) -> None:
        with self._lock:
            new_speed = max(0.1, min(4.0, float(speed)))
            if self.state.playing:
                self._start_monotonic = time.monotonic() - self.state.time / max(0.01, new_speed)
            self.state.speed = new_speed
        self._emit(force=True)

    def set_loop(self, loop: bool) -> None:
        with self._lock:
            self.state.loop = bool(loop)
        self._emit(force=True)

    def jump_to_scene(self, scene_id: str) -> None:
        for sc in self.engine.project.scenes:
            if sc.id == scene_id:
                self.seek(sc.cue_time)
                return

    # ----------------------------------------------------------- playback
    def _run_playback(self) -> None:
        fps = max(1, self.state.fps)
        frame_interval = 1.0 / fps
        max_jitter = frame_interval * 2.5  # Catch up threshold
        frame_count = 0
        speed = self.state.speed

        while not self._stop_event.is_set():
            with self._lock:
                if not self.state.playing:
                    break

                now = time.monotonic()
                expected_elapsed = (now - self._start_monotonic) * speed
                duration = self.engine.total_duration()
                target_time = expected_elapsed

                # Loop handling
                if target_time >= duration:
                    if self.state.loop:
                        wrap_count = int(target_time / duration)
                        target_time = target_time - wrap_count * duration
                        self._start_monotonic = now - target_time / max(0.01, speed)
                    else:
                        target_time = duration
                        self.state.time = duration
                        self.state.playing = False
                        self._advance_scene()
                        self._render()
                        self._emit(force=True)
                        return

                # Check if we need to skip frames (catch up)
                drift = expected_elapsed - self.state.time
                if drift > max_jitter:
                    # Skip catch-up frames, only render the current target
                    self._start_monotonic = now - target_time / max(0.01, speed)

                # Update state and render
                self.state.time = target_time
                self._advance_scene()
                self._render()

                # Throttle UI updates to reduce overhead
                frame_count += 1
                should_emit = frame_count % self._ui_update_interval == 0
                emit_snapshot = TimelineState(
                    playing=self.state.playing,
                    time=self.state.time,
                    fps=self.state.fps,
                    speed=self.state.speed,
                    loop=self.state.loop,
                    current_scene_id=self.state.current_scene_id,
                ) if should_emit else None

            if emit_snapshot is not None:
                for fn in list(self._listeners):
                    try:
                        fn(emit_snapshot)
                    except Exception:
                        pass

            # Precise wait: sleep most of the time, then spin for accuracy
            next_frame = frame_interval - ((time.monotonic() - now) / speed)
            if next_frame > 0.002:
                time.sleep(next_frame - 0.002)
            # Spin wait for the last 2ms for precision
            deadline = now + frame_interval / speed
            while time.monotonic() < deadline and not self._stop_event.is_set():
                pass

    def _advance_scene(self) -> None:
        sc = self.engine.scene_at(self.state.time)
        self.state.current_scene_id = sc.id if sc else None

    def _render(self) -> None:
        snapshot = self.engine.sample(self.state.time)
        self.simulator.apply_snapshot(snapshot)
        if self.external is not None and self.external.connected:
            try:
                self.external.send_frame(snapshot)
            except Exception:
                pass

    # ----------------------------------------------------------- lifecycle
    def close(self) -> None:
        self._stop_event.set()
        self.state.playing = False
        if self._thread is not None:
            self._thread.join(timeout=1.0)
            self._thread = None
        if self.external is not None:
            self.external.close()
