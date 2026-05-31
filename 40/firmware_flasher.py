import hashlib
import struct
import time
import zlib
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import List, Optional, Dict, Any, Callable, Tuple

from device_comms import DeviceConnection, DeviceProtocol, CommunicationResult
from chunk_manager import (
    FirmwareChunks,
    SmartChunkStrategy,
    ChunkTransferPipeline,
    ChunkInfo,
)


class FlashState(Enum):
    IDLE = "idle"
    INITIALIZING = "initializing"
    ERASING = "erasing"
    FLASHING = "flashing"
    VERIFYING = "verifying"
    RESUMING = "resuming"
    RETRYING = "retrying"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class FirmwareInfo:
    file_path: str
    file_size: int = 0
    md5: str = ""
    sha256: str = ""
    crc32: str = ""
    version: str = ""
    chunk_count: int = 0
    chunk_size: int = 1024

    def __post_init__(self):
        if self.file_path and Path(self.file_path).exists():
            self._load_info()

    def _load_info(self):
        path = Path(self.file_path)
        self.file_size = path.stat().st_size
        with open(path, "rb") as f:
            data = f.read()
            self.md5 = hashlib.md5(data).hexdigest()
            self.sha256 = hashlib.sha256(data).hexdigest()
            self.crc32 = f"{zlib.crc32(data) & 0xFFFFFFFF:08x}"


@dataclass
class FlashProgress:
    device_id: str
    state: FlashState = FlashState.IDLE
    total_chunks: int = 0
    current_chunk: int = 0
    bytes_written: int = 0
    total_bytes: int = 0
    error_message: str = ""
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    verify_success: Optional[bool] = None
    retry_count: int = 0
    consecutive_failures: int = 0
    last_successful_chunk: int = -1
    transfer_speed: float = 0.0

    @property
    def progress_percent(self) -> float:
        if self.total_chunks == 0:
            return 0.0
        return (self.current_chunk / self.total_chunks) * 100

    @property
    def elapsed_time(self) -> float:
        if self.start_time is None:
            return 0.0
        end = self.end_time or time.time()
        return end - self.start_time

    @property
    def speed_bps(self) -> float:
        elapsed = self.elapsed_time
        if elapsed == 0:
            return 0.0
        return self.bytes_written / elapsed


@dataclass
class FlashResult:
    device_id: str
    success: bool
    error_message: str = ""
    firmware_info: Optional[FirmwareInfo] = None
    progress: Optional[FlashProgress] = None
    verify_result: bool = False
    was_resumed: bool = False
    failed_chunks: List[int] = field(default_factory=list)
    total_retry_count: int = 0


@dataclass
class ChunkTransferResult:
    success: bool
    retry_needed: bool = False
    should_resume: bool = False
    resume_from_chunk: int = 0
    error: str = ""


class AdaptiveTimeout:
    def __init__(self, base_timeout: float = 5.0, min_timeout: float = 2.0, max_timeout: float = 30.0):
        self.base_timeout = base_timeout
        self.min_timeout = min_timeout
        self.max_timeout = max_timeout
        self.current_timeout = base_timeout
        self.successful_transfers = 0
        self.failed_transfers = 0
        self._response_times: List[float] = []

    def update(self, success: bool, response_time: float = 0.0):
        if success:
            self.successful_transfers += 1
            if response_time > 0:
                self._response_times.append(response_time)
                if len(self._response_times) > 20:
                    self._response_times.pop(0)
            if self.successful_transfers >= 5:
                self.current_timeout = max(
                    self.min_timeout,
                    self.current_timeout * 0.9
                )
                self.successful_transfers = 0
        else:
            self.failed_transfers += 1
            self.current_timeout = min(
                self.max_timeout,
                self.current_timeout * 1.5
            )
            self.successful_transfers = 0

    def get_timeout(self) -> float:
        return self.current_timeout


class FlowController:
    def __init__(self, initial_chunk_size: int = 1024, max_chunk_size: int = 4096):
        self.current_chunk_size = initial_chunk_size
        self.max_chunk_size = max_chunk_size
        self.min_chunk_size = 256
        self.consecutive_success = 0
        self.consecutive_failure = 0

    def on_success(self):
        self.consecutive_success += 1
        self.consecutive_failure = 0
        if self.consecutive_success >= 10 and self.current_chunk_size < self.max_chunk_size:
            self.current_chunk_size = min(self.max_chunk_size, self.current_chunk_size * 2)
            self.consecutive_success = 0

    def on_failure(self):
        self.consecutive_failure += 1
        self.consecutive_success = 0
        if self.consecutive_failure >= 3 and self.current_chunk_size > self.min_chunk_size:
            self.current_chunk_size = max(self.min_chunk_size, self.current_chunk_size // 2)

    def get_chunk_size(self) -> int:
        return self.current_chunk_size


class FirmwareFlasher:
    def __init__(
        self,
        connection: DeviceConnection,
        firmware_file: str,
        max_retries: int = 5,
        verify: bool = True,
        erase_before_flash: bool = False,
        enable_resume: bool = True,
        chunk_size: int = 1024,
        use_smart_chunks: bool = True,
        window_size: int = 3,
    ):
        self.connection = connection
        self.firmware_file = firmware_file
        self.max_retries = max_retries
        self.verify = verify
        self.erase_before_flash = erase_before_flash
        self.enable_resume = enable_resume
        self.chunk_size = chunk_size
        self.use_smart_chunks = use_smart_chunks
        self.window_size = window_size

        self._chunks: Optional[FirmwareChunks] = None
        self._firmware_info = FirmwareInfo(file_path=firmware_file)
        self._pipeline: Optional[ChunkTransferPipeline] = None

        self.progress = FlashProgress(
            device_id=connection.device_info.device_id,
            total_bytes=self._firmware_info.file_size,
        )
        self._progress_callback: Optional[Callable[[FlashProgress], None]] = None
        self._adaptive_timeout = AdaptiveTimeout(base_timeout=5.0)
        self._flow_controller = FlowController(initial_chunk_size=chunk_size)
        self._was_resumed = False
        self._failed_chunks: List[int] = []

    def set_progress_callback(self, callback: Callable[[FlashProgress], None]):
        self._progress_callback = callback

    def _notify_progress(self):
        if self._progress_callback:
            self._progress_callback(self.progress)

    def flash(self) -> FlashResult:
        self.progress.start_time = time.time()
        total_retry_count = 0

        try:
            if not self._prepare_flash():
                return self._fail_result("Failed to prepare flash")

            for attempt in range(self.max_retries + 1):
                if attempt > 0:
                    self.progress.state = FlashState.RETRYING
                    self.progress.retry_count = attempt
                    total_retry_count = attempt
                    self._notify_progress()
                    time.sleep(min(1.0 * (2 ** (attempt - 1)), 5.0))

                result = self._flash_attempt(attempt)

                if result.success:
                    return result

                if attempt < self.max_retries:
                    if not self._recover_from_failure():
                        break

            return self._fail_result(
                f"Flash failed after {total_retry_count} retries. "
                f"Failed chunks: {len(self._failed_chunks)}"
            )

        except Exception as e:
            return self._fail_result(str(e))

    def _prepare_flash(self) -> bool:
        try:
            if self.use_smart_chunks:
                self._chunks = SmartChunkStrategy.calculate_chunks(
                    self.firmware_file, base_chunk_size=self.chunk_size
                )
            else:
                self._chunks = SmartChunkStrategy.calculate_chunks(
                    self.firmware_file,
                    base_chunk_size=self.chunk_size,
                    header_protected=False,
                )

            self.progress.total_chunks = self._chunks.total_chunks
            self._firmware_info.chunk_count = self._chunks.total_chunks
            self._firmware_info.md5 = self._chunks.file_md5
            self._firmware_info.sha256 = self._chunks.file_sha256
            self._firmware_info.crc32 = f"{self._chunks.file_crc32:08x}"

            self._pipeline = ChunkTransferPipeline(
                self._chunks,
                window_size=self.window_size,
                max_retries=3,
            )

            return True
        except Exception:
            return False

    def _flash_attempt(self, attempt_num: int) -> FlashResult:
        if not self.connection.is_connected():
            if not self.connection.connect():
                return self._fail_result("Failed to connect to device")

        if not self._wait_for_device_ready():
            return self._fail_result("Device not ready")

        resume_chunk = 0
        if self.enable_resume and not self.erase_before_flash and attempt_num == 0:
            resume_chunk = self._query_resume_point()
            if resume_chunk > 0:
                self.progress.state = FlashState.RESUMING
                self.progress.current_chunk = resume_chunk
                self.progress.last_successful_chunk = resume_chunk - 1
                self.progress.bytes_written = self._calculate_bytes_written(resume_chunk)
                self._was_resumed = True
                self._notify_progress()

        if self.erase_before_flash or (resume_chunk == 0 and attempt_num == 0):
            if not self._erase():
                return self._fail_result("Erase failed")

        if not self._init_flash():
            return self._fail_result("Flash initialization failed")

        if not self._write_chunks_pipeline():
            return self._fail_result("Write chunks failed")

        verify_success = True
        if self.verify:
            verify_success = self._verify()
            self.progress.verify_success = verify_success
            self._notify_progress()
            if not verify_success:
                return self._fail_result("Verification failed")

        if not self._finish_flash():
            return self._fail_result("Finish command failed")

        self.progress.state = FlashState.COMPLETED
        self.progress.end_time = time.time()
        self._notify_progress()

        return FlashResult(
            device_id=self.connection.device_info.device_id,
            success=True,
            firmware_info=self._firmware_info,
            progress=self.progress,
            verify_result=verify_success,
            was_resumed=self._was_resumed,
            failed_chunks=self._failed_chunks,
            total_retry_count=self.progress.retry_count,
        )

    def _calculate_bytes_written(self, chunk_index: int) -> int:
        if not self._chunks:
            return 0
        bytes_written = 0
        for i in range(chunk_index):
            if i < len(self._chunks.chunks):
                bytes_written += self._chunks.chunks[i].size
        return bytes_written

    def _recover_from_failure(self) -> bool:
        try:
            if self._pipeline:
                failed = self._pipeline.get_failed_indices()
                if failed:
                    for idx in failed:
                        if idx not in self._failed_chunks:
                            self._failed_chunks.append(idx)
                self._pipeline.reset()

            if self.connection.is_connected():
                self.connection.disconnect()
            time.sleep(1.0)
            return True
        except Exception:
            return False

    def _wait_for_device_ready(self, timeout: int = 30) -> bool:
        self.progress.state = FlashState.INITIALIZING
        self._notify_progress()

        ping_packet = DeviceProtocol.build_packet(0x00, b"PING")
        start_time = time.time()

        while time.time() - start_time < timeout:
            result = self.connection.send_and_receive(ping_packet, expected_size=16, timeout=2.0)
            if result.success and result.data:
                cmd, data = DeviceProtocol.parse_packet(result.data)
                if cmd == DeviceProtocol.RESP_ACK:
                    return True
            time.sleep(0.5)

        return False

    def _query_resume_point(self) -> int:
        try:
            query_packet = DeviceProtocol.build_packet(DeviceProtocol.CMD_GET_STATUS)
            result = self.connection.send_and_receive(query_packet, expected_size=32, timeout=5.0)

            if result.success and result.data:
                cmd, data = DeviceProtocol.parse_packet(result.data)
                if cmd == DeviceProtocol.RESP_STATUS and len(data) >= 4:
                    last_chunk = struct.unpack("!I", data[:4])[0]
                    if last_chunk > 0:
                        return last_chunk
        except Exception:
            pass
        return 0

    def _erase(self, timeout: int = 60) -> bool:
        self.progress.state = FlashState.ERASING
        self._notify_progress()

        erase_packet = DeviceProtocol.build_packet(DeviceProtocol.CMD_ERASE)
        result = self.connection.send_and_receive(erase_packet, expected_size=16, timeout=timeout)

        if not result.success:
            return False

        cmd, data = DeviceProtocol.parse_packet(result.data)
        return cmd == DeviceProtocol.RESP_ACK

    def _init_flash(self) -> bool:
        self.progress.state = FlashState.INITIALIZING
        self._notify_progress()

        if not self._chunks:
            return False

        init_data = struct.pack(
            "!III",
            self._firmware_info.file_size,
            self._chunks.total_chunks,
            self.chunk_size,
        )
        md5_bytes = bytes.fromhex(self._firmware_info.md5)
        crc32_bytes = bytes.fromhex(self._firmware_info.crc32)
        init_data += md5_bytes + crc32_bytes

        init_packet = DeviceProtocol.build_packet(DeviceProtocol.CMD_FLASH_INIT, init_data)
        result = self.connection.send_and_receive(init_packet, expected_size=16, timeout=10.0)

        if not result.success:
            return False

        cmd, data = DeviceProtocol.parse_packet(result.data)
        return cmd == DeviceProtocol.RESP_ACK

    def _write_chunks_pipeline(self) -> bool:
        self.progress.state = FlashState.FLASHING
        if not self._pipeline:
            return False

        start_time = time.time()
        last_progress_time = start_time

        while self._pipeline.has_more():
            next_item = self._pipeline.get_next()
            if next_item is None:
                time.sleep(0.01)
                continue

            index, data, chunk_info = next_item
            transfer_start = time.time()
            result = self._transfer_chunk(index, data, chunk_info)
            transfer_time = time.time() - transfer_start

            if result.success:
                self._pipeline.mark_success(index, transfer_time)
                self.progress.current_chunk = max(self.progress.current_chunk, index + 1)
                self.progress.bytes_written = self._calculate_bytes_written(self.progress.current_chunk)
                self.progress.last_successful_chunk = index
                self.progress.consecutive_failures = 0
                self._adaptive_timeout.update(True, transfer_time)
                self._flow_controller.on_success()

                current_time = time.time()
                if current_time - last_progress_time >= 0.1:
                    elapsed = current_time - start_time
                    if elapsed > 0:
                        self.progress.transfer_speed = self.progress.bytes_written / elapsed
                    self._notify_progress()
                    last_progress_time = current_time

            elif result.should_resume:
                self._pipeline.mark_success(index)
                self.progress.current_chunk = max(self.progress.current_chunk, result.resume_from_chunk)

            elif result.retry_needed:
                self._pipeline.mark_failed(index)
                self.progress.consecutive_failures += 1
                self._adaptive_timeout.update(False)
                self._flow_controller.on_failure()
                time.sleep(0.05)

            else:
                self._pipeline.mark_failed(index, permanent=True)
                self.progress.consecutive_failures += 1
                if self.progress.consecutive_failures >= 20:
                    return False
                time.sleep(0.1)

        _, failed = self._pipeline.get_progress()
        self._notify_progress()
        return failed == 0

    def _transfer_chunk(self, index: int, data: bytes, chunk_info: ChunkInfo) -> ChunkTransferResult:
        chunk_header = struct.pack("!II", index, chunk_info.crc32)
        packet_data = chunk_header + data

        for attempt in range(self.max_retries + 1):
            timeout = self._adaptive_timeout.get_timeout()
            data_packet = DeviceProtocol.build_packet(DeviceProtocol.CMD_FLASH_DATA, packet_data)
            result = self.connection.send_and_receive(
                data_packet, expected_size=32, timeout=timeout
            )

            if result.success:
                cmd, resp_data = DeviceProtocol.parse_packet(result.data)
                if cmd == DeviceProtocol.RESP_ACK:
                    if len(resp_data) >= 4:
                        resp_index = struct.unpack("!I", resp_data[:4])[0]
                        if resp_index == index:
                            return ChunkTransferResult(success=True)
                        elif resp_index > index:
                            return ChunkTransferResult(
                                success=True, should_resume=True, resume_from_chunk=resp_index
                            )
                elif cmd == DeviceProtocol.RESP_NACK:
                    if len(resp_data) >= 4:
                        expected_index = struct.unpack("!I", resp_data[:4])[0]
                        if expected_index > index:
                            return ChunkTransferResult(
                                success=False, should_resume=True, resume_from_chunk=expected_index
                            )
                    return ChunkTransferResult(success=False, retry_needed=True)

            if attempt < self.max_retries:
                time.sleep(min(0.5 * (attempt + 1), 2.0))

        return ChunkTransferResult(success=False, error="Max retries exceeded for chunk")

    def _verify(self) -> bool:
        self.progress.state = FlashState.VERIFYING
        self._notify_progress()

        verify_data = struct.pack(
            "!I",
            self._firmware_info.file_size,
        ) + bytes.fromhex(self._firmware_info.md5)

        verify_packet = DeviceProtocol.build_packet(DeviceProtocol.CMD_FLASH_VERIFY, verify_data)
        result = self.connection.send_and_receive(verify_packet, expected_size=64, timeout=60.0)

        if not result.success:
            return False

        cmd, data = DeviceProtocol.parse_packet(result.data)
        if cmd != DeviceProtocol.RESP_ACK:
            return False

        if len(data) >= 1:
            return data[0] == 1

        return True

    def _finish_flash(self) -> bool:
        finish_packet = DeviceProtocol.build_packet(DeviceProtocol.CMD_FLASH_END)
        result = self.connection.send_and_receive(finish_packet, expected_size=16, timeout=10.0)

        if not result.success:
            return False

        cmd, _ = DeviceProtocol.parse_packet(result.data)
        return cmd == DeviceProtocol.RESP_ACK

    def _fail_result(self, error_message: str) -> FlashResult:
        self.progress.state = FlashState.FAILED
        self.progress.error_message = error_message
        self.progress.end_time = time.time()
        self._notify_progress()

        return FlashResult(
            device_id=self.connection.device_info.device_id,
            success=False,
            error_message=error_message,
            firmware_info=self._firmware_info,
            progress=self.progress,
            verify_result=False,
            was_resumed=self._was_resumed,
            failed_chunks=self._failed_chunks,
            total_retry_count=self.progress.retry_count,
        )


class FirmwareReader:
    @staticmethod
    def read_firmware(file_path: str) -> bytes:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Firmware file not found: {file_path}")
        return path.read_bytes()

    @staticmethod
    def get_firmware_info(file_path: str) -> Dict[str, Any]:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Firmware file not found: {file_path}")

        data = path.read_bytes()
        return {
            "path": str(path),
            "size": len(data),
            "md5": hashlib.md5(data).hexdigest(),
            "sha256": hashlib.sha256(data).hexdigest(),
            "crc32": f"{zlib.crc32(data) & 0xFFFFFFFF:08x}",
        }

    @staticmethod
    def split_into_chunks(data: bytes, chunk_size: int = 1024) -> List[bytes]:
        return [data[i: i + chunk_size] for i in range(0, len(data), chunk_size)]


class FirmwareLoader:
    def __init__(self, file_path: str, chunk_size: int = 1024):
        self.file_path = file_path
        self.chunk_size = chunk_size
        self._chunks: List[bytes] = []
        self._chunk_crcs: List[int] = []
        self._info: Optional[FirmwareInfo] = None
        self._load()

    def _load(self):
        path = Path(self.file_path)
        if not path.exists():
            raise FileNotFoundError(f"Firmware file not found: {self.file_path}")

        data = path.read_bytes()
        self._info = FirmwareInfo(
            file_path=self.file_path,
            file_size=len(data),
            md5=hashlib.md5(data).hexdigest(),
            sha256=hashlib.sha256(data).hexdigest(),
            crc32=f"{zlib.crc32(data) & 0xFFFFFFFF:08x}",
            chunk_size=self.chunk_size,
        )

        self._chunks = []
        self._chunk_crcs = []
        for i in range(0, len(data), self.chunk_size):
            chunk = data[i: i + self.chunk_size]
            self._chunks.append(chunk)
            self._chunk_crcs.append(zlib.crc32(chunk) & 0xFFFFFFFF)

        self._info.chunk_count = len(self._chunks)

    @property
    def info(self) -> FirmwareInfo:
        return self._info

    @property
    def chunks(self) -> List[bytes]:
        return self._chunks

    def get_chunk(self, index: int) -> Optional[bytes]:
        if 0 <= index < len(self._chunks):
            return self._chunks[index]
        return None

    def get_chunk_crc(self, index: int) -> Optional[int]:
        if 0 <= index < len(self._chunk_crcs):
            return self._chunk_crcs[index]
        return None

    def get_chunk_count(self) -> int:
        return len(self._chunks)
