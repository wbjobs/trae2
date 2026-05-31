import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any

from device_comms import DeviceConnection, DeviceInfo
from .version import FirmwareVersion, VersionStatus
from .validator import VersionValidator


@dataclass
class VersionQueryResult:
    device_id: str
    device_name: str
    success: bool
    version: Optional[FirmwareVersion] = None
    raw_response: str = ""
    error: str = ""
    query_time: float = 0.0


class VersionQuery:
    def __init__(self, device_connection: DeviceConnection):
        self._connection = device_connection
        self._command = 0x01
        self._retry_count = 3
        self._retry_delay = 1.0

    def query_version(self, timeout: float = 5.0) -> VersionQueryResult:
        start_time = time.time()
        last_error = ""

        for attempt in range(self._retry_count):
            try:
                success, response, error = self._send_version_request(timeout)
                if success and response:
                    version = self._parse_version_response(response)
                    if version is not None:
                        query_time = time.time() - start_time
                        return VersionQueryResult(
                            device_id=self._connection.device_info.device_id,
                            device_name=self._connection.device_info.name,
                            success=True,
                            version=version,
                            raw_response=response,
                            query_time=query_time,
                        )
                    else:
                        last_error = "Failed to parse version response"
                else:
                    last_error = error or "Failed to query version"
            except Exception as e:
                last_error = str(e)

            if attempt < self._retry_count - 1:
                time.sleep(self._retry_delay)

        return VersionQueryResult(
            device_id=self._connection.device_info.device_id,
            device_name=self._connection.device_info.name,
            success=False,
            error=last_error,
            query_time=time.time() - start_time,
        )

    def _send_version_request(self, timeout: float):
        data = bytearray([self._command])
        return self._connection.send_command(data, timeout)

    def _parse_version_response(self, response: str) -> Optional[FirmwareVersion]:
        try:
            response = response.strip()
            if not response:
                return None

            version = FirmwareVersion.from_string(response)

            if version.is_valid():
                return version

            return None
        except Exception:
            return None
