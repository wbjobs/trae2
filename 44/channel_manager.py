import threading
import time
from typing import Dict, List, Optional, Set, Tuple
from datetime import datetime

from cache import get_cache
from models import (
    ChannelResource,
    ChannelStatus,
    ChannelType,
    ScheduledTask,
    TaskStatus,
    TaskType,
)


class ChannelManager:
    _instance: Optional["ChannelManager"] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._cache = get_cache()
        self._channels: Dict[str, ChannelResource] = {}
        self._channel_versions: Dict[str, int] = {}
        self._rw_lock = threading.RLock()
        self._allocation_map: Dict[str, Tuple[str, float]] = {}
        self._allocation_timeout = 300.0
        self._idle_by_type: Dict[str, Set[str]] = {}
        self._channels_by_type: Dict[str, Set[str]] = {}
        self._channels_by_satellite: Dict[str, Set[str]] = {}
        self._channels_by_status: Dict[str, Set[str]] = {}
        self._task_type_priority: Dict[TaskType, List[ChannelType]] = {
            TaskType.UPLINK_TRANSMISSION: [ChannelType.UHF, ChannelType.S_BAND],
            TaskType.DOWNLINK_RECEPTION: [ChannelType.X_BAND, ChannelType.S_BAND, ChannelType.KA_BAND],
            TaskType.TELEMETRY_ACQUISITION: [ChannelType.UHF, ChannelType.S_BAND],
            TaskType.CALIBRATION: [ChannelType.S_BAND, ChannelType.UHF],
        }
        self._bootstrap_default_channels()
        self._cleanup_thread = threading.Thread(
            target=self._run_cleanup, daemon=True, name="channel-cleanup"
        )
        self._cleanup_thread.start()

    def _bootstrap_default_channels(self):
        defaults = [
            ChannelResource(
                channel_id="CH-UHF-001",
                channel_type=ChannelType.UHF,
                frequency_mhz=435.0,
                bandwidth_mhz=0.5,
                antenna_id="ANT-UHF-01",
                supported_satellites=["SAT-001", "SAT-002"],
            ),
            ChannelResource(
                channel_id="CH-UHF-002",
                channel_type=ChannelType.UHF,
                frequency_mhz=437.0,
                bandwidth_mhz=0.5,
                antenna_id="ANT-UHF-01",
                supported_satellites=["SAT-003", "SAT-004"],
            ),
            ChannelResource(
                channel_id="CH-S-001",
                channel_type=ChannelType.S_BAND,
                frequency_mhz=2200.0,
                bandwidth_mhz=5.0,
                antenna_id="ANT-S-01",
                supported_satellites=["SAT-001", "SAT-002", "SAT-005"],
            ),
            ChannelResource(
                channel_id="CH-S-002",
                channel_type=ChannelType.S_BAND,
                frequency_mhz=2250.0,
                bandwidth_mhz=10.0,
                antenna_id="ANT-S-02",
                supported_satellites=["SAT-003", "SAT-006"],
            ),
            ChannelResource(
                channel_id="CH-X-001",
                channel_type=ChannelType.X_BAND,
                frequency_mhz=8400.0,
                bandwidth_mhz=20.0,
                antenna_id="ANT-X-01",
                supported_satellites=["SAT-005", "SAT-006"],
            ),
            ChannelResource(
                channel_id="CH-KA-001",
                channel_type=ChannelType.KA_BAND,
                frequency_mhz=26500.0,
                bandwidth_mhz=50.0,
                antenna_id="ANT-KA-01",
                supported_satellites=["SAT-007"],
            ),
        ]
        for ch in defaults:
            self._channels[ch.channel_id] = ch
            self._channel_versions[ch.channel_id] = 1
            self._add_to_indexes(ch)
            self._cache.set(
                f"channel:{ch.channel_id}", ch.model_dump(), category="channel"
            )

    def _add_to_indexes(self, ch: ChannelResource):
        ctype = ch.channel_type.value
        if ctype not in self._channels_by_type:
            self._channels_by_type[ctype] = set()
        self._channels_by_type[ctype].add(ch.channel_id)

        if ch.status == ChannelStatus.IDLE:
            if ctype not in self._idle_by_type:
                self._idle_by_type[ctype] = set()
            self._idle_by_type[ctype].add(ch.channel_id)

        status_key = ch.status.value
        if status_key not in self._channels_by_status:
            self._channels_by_status[status_key] = set()
        self._channels_by_status[status_key].add(ch.channel_id)

        for sat_id in ch.supported_satellites:
            if sat_id not in self._channels_by_satellite:
                self._channels_by_satellite[sat_id] = set()
            self._channels_by_satellite[sat_id].add(ch.channel_id)

    def _remove_from_indexes(self, ch: ChannelResource):
        ctype = ch.channel_type.value
        if ctype in self._channels_by_type:
            self._channels_by_type[ctype].discard(ch.channel_id)
        if ctype in self._idle_by_type:
            self._idle_by_type[ctype].discard(ch.channel_id)
        status_key = ch.status.value
        if status_key in self._channels_by_status:
            self._channels_by_status[status_key].discard(ch.channel_id)
        for sat_id in ch.supported_satellites:
            if sat_id in self._channels_by_satellite:
                self._channels_by_satellite[sat_id].discard(ch.channel_id)

    def _update_status_index(self, channel_id: str, old_status: ChannelStatus, new_status: ChannelStatus):
        old_key = old_status.value
        new_key = new_status.value
        if old_key in self._channels_by_status:
            self._channels_by_status[old_key].discard(channel_id)
        if new_key not in self._channels_by_status:
            self._channels_by_status[new_key] = set()
        self._channels_by_status[new_key].add(channel_id)

        ch = self._channels.get(channel_id)
        if ch:
            ctype = ch.channel_type.value
            if new_status == ChannelStatus.IDLE:
                if ctype not in self._idle_by_type:
                    self._idle_by_type[ctype] = set()
                self._idle_by_type[ctype].add(channel_id)
            else:
                if ctype in self._idle_by_type:
                    self._idle_by_type[ctype].discard(channel_id)

    def _sync_cache(self, channel: ChannelResource):
        self._cache.set(
            f"channel:{channel.channel_id}", channel.model_dump(), category="channel"
        )

    def _inc_version(self, channel_id: str) -> int:
        self._channel_versions[channel_id] = self._channel_versions.get(channel_id, 0) + 1
        return self._channel_versions[channel_id]

    def _run_cleanup(self):
        while True:
            try:
                self._cleanup_stale_allocations()
            except Exception:
                pass
            time.sleep(30)

    def _cleanup_stale_allocations(self):
        now = time.time()
        stale_tasks = []
        with self._rw_lock:
            for task_id, (channel_id, alloc_time) in list(self._allocation_map.items()):
                if now - alloc_time > self._allocation_timeout:
                    stale_tasks.append((task_id, channel_id))
        for task_id, channel_id in stale_tasks:
            try:
                self.release_channel(task_id, force=True)
            except Exception:
                pass

    def add_channel(self, channel: ChannelResource) -> bool:
        with self._rw_lock:
            if channel.channel_id in self._channels:
                return False
            self._channels[channel.channel_id] = channel
            self._channel_versions[channel.channel_id] = 1
            self._add_to_indexes(channel)
            self._sync_cache(channel)
            return True

    def remove_channel(self, channel_id: str) -> bool:
        with self._rw_lock:
            if channel_id not in self._channels:
                return False
            ch = self._channels.pop(channel_id)
            self._channel_versions.pop(channel_id, None)
            self._remove_from_indexes(ch)
            self._cache.delete(f"channel:{channel_id}")
            return True

    def get_channel(self, channel_id: str) -> Optional[ChannelResource]:
        cached = self._cache.get(f"channel:{channel_id}")
        if cached:
            return ChannelResource(**cached)
        with self._rw_lock:
            return self._channels.get(channel_id)

    def list_channels(
        self,
        status: Optional[ChannelStatus] = None,
        channel_type: Optional[ChannelType] = None,
        satellite_id: Optional[str] = None,
    ) -> List[ChannelResource]:
        with self._rw_lock:
            if satellite_id:
                ids = self._channels_by_satellite.get(satellite_id, set())
                result = [self._channels[ch_id] for ch_id in ids if ch_id in self._channels]
            elif status:
                ids = self._channels_by_status.get(status.value, set())
                result = [self._channels[ch_id] for ch_id in ids if ch_id in self._channels]
            elif channel_type:
                ids = self._channels_by_type.get(channel_type.value, set())
                result = [self._channels[ch_id] for ch_id in ids if ch_id in self._channels]
            else:
                result = list(self._channels.values())

        if status:
            result = [c for c in result if c.status == status]
        if channel_type:
            result = [c for c in result if c.channel_type == channel_type]
        if satellite_id:
            result = [c for c in result if satellite_id in c.supported_satellites]
        return sorted(result, key=lambda c: c.channel_id)

    def update_channel_status(
        self, channel_id: str, status: ChannelStatus, expected_version: Optional[int] = None
    ) -> Tuple[bool, int]:
        with self._rw_lock:
            channel = self._channels.get(channel_id)
            if channel is None:
                return False, 0
            current_version = self._channel_versions.get(channel_id, 0)
            if expected_version is not None and current_version != expected_version:
                return False, current_version
            old_status = channel.status
            channel.status = status
            channel.last_heartbeat = datetime.utcnow()
            new_version = self._inc_version(channel_id)
            self._update_status_index(channel_id, old_status, status)
            self._sync_cache(channel)
            return True, new_version

    def heartbeat(self, channel_id: str) -> bool:
        with self._rw_lock:
            channel = self._channels.get(channel_id)
            if channel is None:
                return False
            channel.last_heartbeat = datetime.utcnow()
            self._sync_cache(channel)
            return True

    def allocate_channel(
        self, task: ScheduledTask
    ) -> Tuple[bool, Optional[ChannelResource], str]:
        preferred_types = self._task_type_priority.get(
            task.task_type, [ChannelType.S_BAND, ChannelType.UHF]
        )

        with self._rw_lock:
            sat_ids = self._channels_by_satellite.get(task.satellite_id, set())

            best_match = None
            for ptype in preferred_types:
                idle_ids = self._idle_by_type.get(ptype.value, set())
                candidates = idle_ids & sat_ids
                for ch_id in candidates:
                    ch = self._channels.get(ch_id)
                    if ch and ch.status == ChannelStatus.IDLE:
                        best_match = ch
                        break
                if best_match:
                    break

            if best_match is None:
                for ptype in preferred_types:
                    idle_ids = self._idle_by_type.get(ptype.value, set())
                    for ch_id in idle_ids:
                        ch = self._channels.get(ch_id)
                        if ch and ch.status == ChannelStatus.IDLE:
                            best_match = ch
                            break
                    if best_match:
                        break

            if best_match is None:
                idle_ids = self._channels_by_status.get(ChannelStatus.IDLE.value, set())
                for ch_id in idle_ids:
                    ch = self._channels.get(ch_id)
                    if ch and ch.status == ChannelStatus.IDLE:
                        best_match = ch
                        break

            if best_match is None:
                return False, None, "No available channel"

            current_version = self._channel_versions.get(best_match.channel_id, 0)
            success, new_version = self.update_channel_status(
                best_match.channel_id, ChannelStatus.BUSY, expected_version=current_version
            )
            if not success:
                return False, None, "Channel version conflict, retry later"

            best_match.status = ChannelStatus.BUSY
            best_match.current_task_id = task.task_id
            task.allocated_channel_id = best_match.channel_id
            self._allocation_map[task.task_id] = (best_match.channel_id, time.time())
            return True, best_match, "Allocated successfully"

    def release_channel(self, task_id: str, force: bool = False) -> bool:
        with self._rw_lock:
            alloc_data = self._allocation_map.pop(task_id, None)
            if alloc_data is None:
                if not force:
                    return False
                channel_id = None
                for ch_id, ch in self._channels.items():
                    if ch.current_task_id == task_id:
                        channel_id = ch_id
                        break
                if channel_id is None:
                    return False
            else:
                channel_id = alloc_data[0]

            channel = self._channels.get(channel_id)
            if channel is None:
                return False
            old_status = channel.status
            channel.status = ChannelStatus.IDLE
            channel.current_task_id = None
            channel.last_heartbeat = datetime.utcnow()
            self._inc_version(channel_id)
            self._update_status_index(channel_id, old_status, ChannelStatus.IDLE)
            self._sync_cache(channel)
            return True

    def get_allocation_stats(self) -> Dict:
        with self._rw_lock:
            total = len(self._channels)
            busy = len(self._channels_by_status.get(ChannelStatus.BUSY.value, set()))
            idle = len(self._channels_by_status.get(ChannelStatus.IDLE.value, set()))
            maintenance = len(self._channels_by_status.get(ChannelStatus.MAINTENANCE.value, set()))
            offline = len(self._channels_by_status.get(ChannelStatus.OFFLINE.value, set()))
            idle_type_counts = {
                t: len(ids) for t, ids in self._idle_by_type.items()
            }
            return {
                "total": total,
                "busy": busy,
                "idle": idle,
                "maintenance": maintenance,
                "offline": offline,
                "allocation_rate": round(busy / total * 100, 2) if total > 0 else 0,
                "allocations": [
                    (tid, cid) for tid, (cid, _) in self._allocation_map.items()
                ],
                "idle_by_type": idle_type_counts,
            }

    def get_available_count(self) -> int:
        with self._rw_lock:
            return len(self._channels_by_status.get(ChannelStatus.IDLE.value, set()))


_channel_manager_instance: Optional[ChannelManager] = None


def get_channel_manager() -> ChannelManager:
    global _channel_manager_instance
    if _channel_manager_instance is None:
        _channel_manager_instance = ChannelManager()
    return _channel_manager_instance