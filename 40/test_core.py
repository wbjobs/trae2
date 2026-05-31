#!/usr/bin/env python3
import unittest
import tempfile
import os
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from device_comms import DeviceProtocol, DeviceType, DeviceInfo, ConnectionStats
from firmware_flasher import (
    FirmwareLoader,
    FirmwareInfo,
    FlashProgress,
    FirmwareFlasher,
    AdaptiveTimeout,
    FlowController,
)
from version_manager import (
    FirmwareVersion,
    VersionValidator,
    VersionComparator,
    VersionStatus,
)
from chunk_manager import (
    SmartChunkStrategy,
    SlidingWindowManager,
    ChunkTransferPipeline,
)
from device_group import (
    DeviceGroup,
    DeviceCatalog,
)
from datetime import datetime


class TestDeviceProtocol(unittest.TestCase):
    def test_packet_build_and_parse(self):
        cmd = DeviceProtocol.CMD_VERSION
        data = b"test data"
        packet = DeviceProtocol.build_packet(cmd, data)
        parsed_cmd, parsed_data = DeviceProtocol.parse_packet(packet)
        self.assertEqual(parsed_cmd, cmd)
        self.assertEqual(parsed_data, data)

    def test_packet_checksum(self):
        cmd = DeviceProtocol.CMD_FLASH_DATA
        data = b"1234567890"
        packet = DeviceProtocol.build_packet(cmd, data)
        packet_corrupted = bytearray(packet)
        packet_corrupted[5] ^= 0xFF
        parsed_cmd, parsed_data = DeviceProtocol.parse_packet(bytes(packet_corrupted))
        self.assertIsNone(parsed_cmd)
        self.assertEqual(parsed_data, b"")

    def test_packet_start_end(self):
        invalid_packet = b"\x00\x01\x00\x04test\x00\x55"
        parsed_cmd, parsed_data = DeviceProtocol.parse_packet(invalid_packet)
        self.assertIsNone(parsed_cmd)
        self.assertEqual(parsed_data, b"")

    def test_crc16(self):
        data = b"123456789"
        crc = DeviceProtocol.calculate_crc16(data)
        self.assertIsInstance(crc, int)
        self.assertGreater(crc, 0)
        self.assertLess(crc, 0x10000)

    def test_max_packet_size(self):
        large_data = b"x" * (DeviceProtocol.MAX_PACKET_SIZE + 1)
        with self.assertRaises(ValueError):
            DeviceProtocol.build_packet(DeviceProtocol.CMD_FLASH_DATA, large_data)


class TestFirmwareVersion(unittest.TestCase):
    def test_version_from_string_valid(self):
        version = FirmwareVersion.from_string("1.2.3")
        self.assertEqual(version.major, 1)
        self.assertEqual(version.minor, 2)
        self.assertEqual(version.patch, 3)
        self.assertEqual(version.build, 0)

    def test_version_from_string_with_build(self):
        version = FirmwareVersion.from_string("2.5.8.1234")
        self.assertEqual(version.major, 2)
        self.assertEqual(version.minor, 5)
        self.assertEqual(version.patch, 8)
        self.assertEqual(version.build, 1234)

    def test_version_from_string_with_hash(self):
        version = FirmwareVersion.from_string("3.1.0 (abcdef123456)")
        self.assertEqual(version.major, 3)
        self.assertEqual(version.minor, 1)
        self.assertEqual(version.patch, 0)
        self.assertEqual(version.commit_hash, "abcdef123456")

    def test_version_comparison(self):
        v1 = FirmwareVersion(1, 2, 3)
        v2 = FirmwareVersion(1, 2, 4)
        v3 = FirmwareVersion(1, 3, 0)
        v4 = FirmwareVersion(2, 0, 0)

        self.assertTrue(v1 < v2)
        self.assertTrue(v2 < v3)
        self.assertTrue(v3 < v4)
        self.assertTrue(v1 < v4)
        self.assertTrue(v1 == FirmwareVersion(1, 2, 3))
        self.assertTrue(v2 > v1)

    def test_version_compare(self):
        v1 = FirmwareVersion(1, 2, 3)
        v2 = FirmwareVersion(1, 2, 3)
        v3 = FirmwareVersion(1, 2, 4)
        v4 = FirmwareVersion(1, 1, 5)

        self.assertEqual(v1.compare(v2), 0)
        self.assertEqual(v1.compare(v3), -1)
        self.assertEqual(v1.compare(v4), 1)

    def test_version_is_valid(self):
        v1 = FirmwareVersion(0, 0, 0)
        v2 = FirmwareVersion(1, 0, 0)
        v3 = FirmwareVersion(0, 1, 0)
        v4 = FirmwareVersion(0, 0, 1)

        self.assertFalse(v1.is_valid())
        self.assertTrue(v2.is_valid())
        self.assertTrue(v3.is_valid())
        self.assertTrue(v4.is_valid())

    def test_version_str(self):
        v = FirmwareVersion(2, 5, 8, 1234, "abcdef123456")
        self.assertEqual(str(v), "2.5.8.1234 (abcdef12)")


class TestVersionValidator(unittest.TestCase):
    def test_sanitize_int_valid(self):
        self.assertEqual(VersionValidator.sanitize_int(100), 100)
        self.assertEqual(VersionValidator.sanitize_int("200"), 200)

    def test_sanitize_int_invalid(self):
        self.assertEqual(VersionValidator.sanitize_int("invalid"), 0)
        self.assertEqual(VersionValidator.sanitize_int(None), 0)
        self.assertEqual(VersionValidator.sanitize_int(-5), 0)
        self.assertEqual(VersionValidator.sanitize_int(10000000), 999999)

    def test_validate_version_valid(self):
        v = FirmwareVersion(1, 2, 3, 1000)
        valid, errors = VersionValidator.validate_version(v)
        self.assertTrue(valid)
        self.assertEqual(len(errors), 0)

    def test_validate_version_invalid(self):
        v = FirmwareVersion(-1, 1000000, -5, 100000000)
        valid, errors = VersionValidator.validate_version(v)
        self.assertFalse(valid)
        self.assertEqual(len(errors), 4)


class TestVersionComparator(unittest.TestCase):
    def test_compare_versions_current(self):
        v1 = FirmwareVersion(1, 2, 3)
        v2 = FirmwareVersion(1, 2, 3)
        status = VersionComparator.compare_versions(v1, v2)
        self.assertEqual(status, VersionStatus.CURRENT)

    def test_compare_versions_outdated(self):
        v1 = FirmwareVersion(1, 2, 3)
        v2 = FirmwareVersion(1, 2, 4)
        status = VersionComparator.compare_versions(v1, v2)
        self.assertEqual(status, VersionStatus.OUTDATED)

    def test_compare_versions_newer(self):
        v1 = FirmwareVersion(2, 0, 0)
        v2 = FirmwareVersion(1, 9, 9)
        status = VersionComparator.compare_versions(v1, v2)
        self.assertEqual(status, VersionStatus.NEWER)

    def test_compare_versions_unknown(self):
        v1 = FirmwareVersion(0, 0, 0)
        v2 = FirmwareVersion(1, 0, 0)
        status = VersionComparator.compare_versions(v1, v2)
        self.assertEqual(status, VersionStatus.UNKNOWN)

    def test_check_compatibility(self):
        v1 = FirmwareVersion(1, 2, 3)
        v2 = FirmwareVersion(1, 5, 0)
        v3 = FirmwareVersion(2, 0, 0)

        self.assertTrue(VersionComparator._check_compatibility(v1, v2))
        self.assertFalse(VersionComparator._check_compatibility(v1, v3))


class TestFirmwareLoader(unittest.TestCase):
    def setUp(self):
        self.test_file = tempfile.NamedTemporaryFile(delete=False)
        self.test_data = b"Test firmware data " * 100
        self.test_file.write(self.test_data)
        self.test_file.close()

    def tearDown(self):
        os.unlink(self.test_file.name)

    def test_load_firmware(self):
        loader = FirmwareLoader(self.test_file.name, chunk_size=256)
        self.assertEqual(loader.info.file_size, len(self.test_data))
        self.assertGreater(loader.get_chunk_count(), 0)

    def test_chunk_count(self):
        loader = FirmwareLoader(self.test_file.name, chunk_size=256)
        expected_chunks = (len(self.test_data) + 255) // 256
        self.assertEqual(loader.get_chunk_count(), expected_chunks)

    def test_get_chunk(self):
        loader = FirmwareLoader(self.test_file.name, chunk_size=256)
        chunk0 = loader.get_chunk(0)
        self.assertEqual(chunk0, self.test_data[:256])

        last_chunk_idx = loader.get_chunk_count() - 1
        last_chunk = loader.get_chunk(last_chunk_idx)
        expected_last = self.test_data[last_chunk_idx * 256 :]
        self.assertEqual(last_chunk, expected_last)

    def test_chunk_crc(self):
        loader = FirmwareLoader(self.test_file.name, chunk_size=256)
        for i in range(loader.get_chunk_count()):
            crc = loader.get_chunk_crc(i)
            chunk = loader.get_chunk(i)
            import zlib
            expected_crc = zlib.crc32(chunk) & 0xFFFFFFFF
            self.assertEqual(crc, expected_crc)

    def test_nonexistent_file(self):
        with self.assertRaises(FileNotFoundError):
            FirmwareLoader("nonexistent_file.bin")


class TestAdaptiveTimeout(unittest.TestCase):
    def test_initial_timeout(self):
        at = AdaptiveTimeout(base_timeout=5.0)
        self.assertEqual(at.get_timeout(), 5.0)

    def test_timeout_decrease_on_success(self):
        at = AdaptiveTimeout(base_timeout=10.0)
        for _ in range(10):
            at.update(True)
        self.assertLess(at.get_timeout(), 10.0)

    def test_timeout_increase_on_failure(self):
        at = AdaptiveTimeout(base_timeout=5.0)
        at.update(False)
        self.assertGreater(at.get_timeout(), 5.0)

    def test_timeout_bounds(self):
        at = AdaptiveTimeout(base_timeout=5.0, min_timeout=2.0, max_timeout=30.0)
        for _ in range(50):
            at.update(True)
        self.assertGreaterEqual(at.get_timeout(), 2.0)

        for _ in range(50):
            at.update(False)
        self.assertLessEqual(at.get_timeout(), 30.0)


class TestFlowController(unittest.TestCase):
    def test_initial_chunk_size(self):
        fc = FlowController(initial_chunk_size=1024)
        self.assertEqual(fc.get_chunk_size(), 1024)

    def test_increase_on_success(self):
        fc = FlowController(initial_chunk_size=512, max_chunk_size=2048)
        for _ in range(15):
            fc.on_success()
        self.assertEqual(fc.get_chunk_size(), 1024)

    def test_decrease_on_failure(self):
        fc = FlowController(initial_chunk_size=2048)
        for _ in range(5):
            fc.on_failure()
        self.assertEqual(fc.get_chunk_size(), 256)

    def test_chunk_size_bounds(self):
        fc = FlowController(initial_chunk_size=1024, max_chunk_size=4096)
        for _ in range(100):
            fc.on_success()
        self.assertLessEqual(fc.get_chunk_size(), 4096)

        for _ in range(100):
            fc.on_failure()
        self.assertGreaterEqual(fc.get_chunk_size(), 256)


class TestFlashProgress(unittest.TestCase):
    def test_progress_percent(self):
        p = FlashProgress("test", total_chunks=100)
        p.current_chunk = 50
        self.assertEqual(p.progress_percent, 50.0)

    def test_progress_zero_chunks(self):
        p = FlashProgress("test", total_chunks=0)
        self.assertEqual(p.progress_percent, 0.0)

    def test_elapsed_time(self):
        import time
        p = FlashProgress("test")
        p.start_time = time.time() - 5.0
        self.assertGreaterEqual(p.elapsed_time, 4.9)

    def test_speed_bps(self):
        import time
        p = FlashProgress("test")
        p.start_time = time.time() - 2.0
        p.bytes_written = 2048
        self.assertAlmostEqual(p.speed_bps, 1024, delta=50)


class TestDeviceInfo(unittest.TestCase):
    def test_serial_device(self):
        dev = DeviceInfo(
            device_id="test_serial",
            device_type=DeviceType.SERIAL,
            connection="/dev/ttyUSB0",
            name="Test Device",
            baudrate=115200,
        )
        self.assertEqual(dev.device_type, DeviceType.SERIAL)
        self.assertEqual(dev.connection, "/dev/ttyUSB0")
        self.assertEqual(dev.baudrate, 115200)

    def test_network_device(self):
        dev = DeviceInfo(
            device_id="test_net",
            device_type=DeviceType.NETWORK,
            connection="192.168.1.100",
            name="Test Net Device",
            port=8080,
        )
        self.assertEqual(dev.device_type, DeviceType.NETWORK)
        self.assertEqual(dev.connection, "192.168.1.100")
        self.assertEqual(dev.port, 8080)


class TestConnectionStats(unittest.TestCase):
    def test_initial_stats(self):
        stats = ConnectionStats()
        self.assertEqual(stats.bytes_sent, 0)
        self.assertEqual(stats.bytes_received, 0)
        self.assertEqual(stats.errors, 0)
        self.assertEqual(stats.reconnect_count, 0)

    def test_avg_response_time(self):
        stats = ConnectionStats()
        stats.add_response_time(0.1)
        stats.add_response_time(0.2)
        stats.add_response_time(0.3)
        self.assertAlmostEqual(stats.avg_response_time, 0.2, places=5)

    def test_windowed_response_time(self):
        stats = ConnectionStats()
        for i in range(60):
            stats.add_response_time(float(i))
        self.assertEqual(len(stats._response_times), 50)


def run_tests():
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromModule(sys.modules[__name__])
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


class TestSmartChunkStrategy(unittest.TestCase):
    def test_small_file_chunking(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as f:
            f.write(os.urandom(5 * 1024))
            temp_file = f.name

        try:
            chunks = SmartChunkStrategy.calculate_chunks(temp_file, base_chunk_size=1024)
            self.assertGreater(chunks.total_chunks, 0)
            self.assertGreater(chunks.file_size, 0)
            self.assertNotEqual(chunks.file_md5, "")
            self.assertNotEqual(chunks.file_sha256, "")
        finally:
            os.unlink(temp_file)

    def test_header_protection(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as f:
            f.write(os.urandom(10 * 1024))
            temp_file = f.name

        try:
            chunks = SmartChunkStrategy.calculate_chunks(temp_file, base_chunk_size=1024)
            self.assertGreater(len(chunks.header_chunks), 0)
            for idx in chunks.header_chunks:
                self.assertLessEqual(chunks.chunks[idx].size, 512)
        finally:
            os.unlink(temp_file)

    def test_optimal_chunk_size_small_file(self):
        size = 512 * 1024
        chunk_size = SmartChunkStrategy._optimal_chunk_size(size, 1024)
        self.assertLessEqual(chunk_size, 1024)

    def test_optimal_chunk_size_large_file(self):
        size = 50 * 1024 * 1024
        chunk_size = SmartChunkStrategy._optimal_chunk_size(size, 1024)
        self.assertGreaterEqual(chunk_size, 2048)

    def test_chunk_data_access(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as f:
            f.write(os.urandom(5 * 1024))
            temp_file = f.name

        try:
            chunks = SmartChunkStrategy.calculate_chunks(temp_file, base_chunk_size=1024)
            data = chunks.get_chunk_data(0)
            self.assertIsNotNone(data)
            self.assertEqual(len(data), chunks.chunks[0].size)
        finally:
            os.unlink(temp_file)

    def test_chunk_crcs_are_valid(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as f:
            f.write(os.urandom(5 * 1024))
            temp_file = f.name

        try:
            chunks = SmartChunkStrategy.calculate_chunks(temp_file, base_chunk_size=1024)
            for chunk in chunks.chunks:
                self.assertGreater(chunk.crc32, 0)
                self.assertGreater(chunk.size, 0)
        finally:
            os.unlink(temp_file)


class TestSlidingWindowManager(unittest.TestCase):
    def test_can_send_initial(self):
        sw = SlidingWindowManager(window_size=3)
        self.assertTrue(sw.can_send())

    def test_window_limit(self):
        sw = SlidingWindowManager(window_size=2)
        sw.mark_sent(0)
        sw.mark_sent(1)
        self.assertFalse(sw.can_send())

    def test_ack_releases_slot(self):
        sw = SlidingWindowManager(window_size=2)
        sw.mark_sent(0)
        sw.mark_sent(1)
        sw.mark_acked(0)
        self.assertTrue(sw.can_send())

    def test_get_unacked(self):
        sw = SlidingWindowManager(window_size=5)
        sw.mark_sent(0)
        sw.mark_sent(1)
        sw.mark_acked(0)
        unacked = sw.get_unacked()
        self.assertIn(1, unacked)
        self.assertNotIn(0, unacked)

    def test_clear(self):
        sw = SlidingWindowManager(window_size=3)
        sw.mark_sent(0)
        sw.mark_acked(0)
        sw.clear()
        self.assertTrue(sw.can_send())
        self.assertEqual(sw.get_unacked(), [])


class TestChunkTransferPipeline(unittest.TestCase):
    def test_initial_state(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as f:
            f.write(os.urandom(5 * 1024))
            temp_file = f.name

        try:
            chunks = SmartChunkStrategy.calculate_chunks(temp_file, base_chunk_size=1024)
            pipeline = ChunkTransferPipeline(chunks, window_size=3)
            self.assertTrue(pipeline.has_more())
        finally:
            os.unlink(temp_file)

    def test_get_next_chunk(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as f:
            f.write(os.urandom(5 * 1024))
            temp_file = f.name

        try:
            chunks = SmartChunkStrategy.calculate_chunks(temp_file, base_chunk_size=1024)
            pipeline = ChunkTransferPipeline(chunks, window_size=3)
            item = pipeline.get_next()
            self.assertIsNotNone(item)
            index, data, chunk_info = item
            self.assertEqual(index, 0)
            self.assertEqual(len(data), chunk_info.size)
        finally:
            os.unlink(temp_file)

    def test_mark_success(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as f:
            f.write(os.urandom(5 * 1024))
            temp_file = f.name

        try:
            chunks = SmartChunkStrategy.calculate_chunks(temp_file, base_chunk_size=1024)
            pipeline = ChunkTransferPipeline(chunks, window_size=3)
            item = pipeline.get_next()
            if item:
                index, _, _ = item
                pipeline.mark_success(index)
                success, failed = pipeline.get_progress()
                self.assertGreaterEqual(success, 1)
        finally:
            os.unlink(temp_file)

    def test_mark_failed_retry(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as f:
            f.write(os.urandom(5 * 1024))
            temp_file = f.name

        try:
            chunks = SmartChunkStrategy.calculate_chunks(temp_file, base_chunk_size=1024)
            pipeline = ChunkTransferPipeline(chunks, window_size=3, max_retries=3)
            item = pipeline.get_next()
            if item:
                index, _, _ = item
                pipeline.mark_failed(index)
                self.assertTrue(pipeline.has_more())
        finally:
            os.unlink(temp_file)


class TestDeviceGroup(unittest.TestCase):
    def test_create_group(self):
        group = DeviceGroup(group_id="test123", name="Test Group")
        self.assertEqual(group.group_id, "test123")
        self.assertEqual(group.name, "Test Group")
        self.assertEqual(group.devices, [])

    def test_add_device_to_group(self):
        group = DeviceGroup(group_id="test123", name="Test Group")
        group.devices.append("dev1")
        self.assertIn("dev1", group.devices)

    def test_group_to_dict(self):
        group = DeviceGroup(group_id="test123", name="Test Group")
        data = group.to_dict()
        self.assertEqual(data["group_id"], "test123")
        self.assertEqual(data["name"], "Test Group")
        self.assertIn("created_at", data)

    def test_group_from_dict(self):
        now = datetime.now().isoformat()
        data = {
            "group_id": "test123",
            "name": "Test Group",
            "description": "Test",
            "devices": ["dev1", "dev2"],
            "created_at": now,
            "updated_at": now,
        }
        group = DeviceGroup.from_dict(data)
        self.assertEqual(group.group_id, "test123")
        self.assertEqual(len(group.devices), 2)


class TestDeviceCatalog(unittest.TestCase):
    def test_add_device(self):
        catalog = DeviceCatalog()
        dev = DeviceInfo(
            device_id="dev1",
            device_type=DeviceType.SERIAL,
            connection="/dev/ttyUSB0",
            name="Test Device",
        )
        self.assertTrue(catalog.add_device(dev))
        self.assertIsNotNone(catalog.get_device("dev1"))

    def test_add_duplicate_device(self):
        catalog = DeviceCatalog()
        dev = DeviceInfo(
            device_id="dev1",
            device_type=DeviceType.SERIAL,
            connection="/dev/ttyUSB0",
            name="Test Device",
        )
        catalog.add_device(dev)
        self.assertFalse(catalog.add_device(dev))

    def test_remove_device(self):
        catalog = DeviceCatalog()
        dev = DeviceInfo(
            device_id="dev1",
            device_type=DeviceType.SERIAL,
            connection="/dev/ttyUSB0",
            name="Test Device",
        )
        catalog.add_device(dev)
        self.assertTrue(catalog.remove_device("dev1"))
        self.assertIsNone(catalog.get_device("dev1"))

    def test_list_devices_by_type(self):
        catalog = DeviceCatalog()
        dev1 = DeviceInfo(
            device_id="dev1",
            device_type=DeviceType.SERIAL,
            connection="/dev/ttyUSB0",
            name="Serial Device",
        )
        dev2 = DeviceInfo(
            device_id="dev2",
            device_type=DeviceType.NETWORK,
            connection="192.168.1.100",
            name="Network Device",
            port=8080,
        )
        catalog.add_device(dev1)
        catalog.add_device(dev2)

        serial_devices = catalog.list_devices(DeviceType.SERIAL)
        self.assertEqual(len(serial_devices), 1)
        self.assertEqual(serial_devices[0].device_id, "dev1")

        net_devices = catalog.list_devices(DeviceType.NETWORK)
        self.assertEqual(len(net_devices), 1)
        self.assertEqual(net_devices[0].device_id, "dev2")


class TestVersionValidatorExtended(unittest.TestCase):
    def test_calculate_checksum(self):
        data = b"test data"
        checksum = VersionValidator.calculate_checksum(data)
        self.assertEqual(len(checksum), 64)

    def test_verify_checksum_valid(self):
        data = b"test data"
        checksum = VersionValidator.calculate_checksum(data)
        self.assertTrue(VersionValidator.verify_checksum(data, checksum))

    def test_verify_checksum_invalid(self):
        data = b"test data"
        self.assertFalse(VersionValidator.verify_checksum(data, "invalid_checksum"))

    def test_sanitize_int_boundary(self):
        self.assertEqual(VersionValidator.sanitize_int(1000000), 999999)
        self.assertEqual(VersionValidator.sanitize_int(-1), 0)
        self.assertEqual(VersionValidator.sanitize_int(500), 500)


class TestVersionComparatorExtended(unittest.TestCase):
    def test_hardware_compatible(self):
        self.assertTrue(VersionComparator.is_hardware_compatible("v1.0", "v1.0"))
        self.assertFalse(VersionComparator.is_hardware_compatible("v1.0", "v2.0"))
        self.assertTrue(VersionComparator.is_hardware_compatible("", "v1.0"))

    def test_version_change_string(self):
        v1 = FirmwareVersion(1, 0, 0, 0)
        v2 = FirmwareVersion(2, 0, 0, 0)
        change = VersionComparator._get_version_change_string(v1, v2)
        self.assertEqual(change, "major")

    def test_change_magnitude(self):
        v1 = FirmwareVersion(1, 0, 0, 0)
        v2 = FirmwareVersion(1, 1, 1, 1)
        magnitude = VersionComparator._get_change_magnitude(v1, v2)
        self.assertEqual(magnitude, 111)


if __name__ == "__main__":
    sys.exit(run_tests())
