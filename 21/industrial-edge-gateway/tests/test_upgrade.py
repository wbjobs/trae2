"""
系统升级综合测试
测试数据流异常熔断、协议自动检测、路由调度重构、批量处理优化
"""
import sys
import os
import time
import unittest
from unittest.mock import MagicMock, patch
import threading

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataflow-router", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "protocol-parser", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts", "orchestration"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "shared", "src"))

from circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerManager,
    CircuitState,
    CircuitBreakerOpenException,
)
from engine import DataFlowEngine
from rule_manager import RuleManager
from protocol_detector import (
    ProtocolDetector,
    ProtocolDetectionResult,
    ProtocolCompatibility,
    ProtocolType,
    ProtocolCompatibilityChecker,
)
from router import (
    RouterManager,
    RouteRule,
    LoadBalancer,
    PathRewriter,
    RequestRouter,
)
from batch_processor import (
    BatchCollector,
    AsyncProcessor,
    DataCompressor,
    ConnectionPool,
    BatchItem,
    BatchResult,
)
from models import DataPoint, DataFlowRule, DeviceInfo
from config import GatewayConfig


class TestCircuitBreaker(unittest.TestCase):
    """熔断器测试"""

    def test_circuit_breaker_state_transitions(self):
        """测试熔断器状态转换"""
        cb = CircuitBreaker(
            name="test_cb",
            failure_threshold=3,
            recovery_timeout=0.1,
            success_threshold=2,
        )

        self.assertEqual(cb.state, CircuitState.CLOSED)
        self.assertTrue(cb.can_execute())

        for _ in range(3):
            cb.on_failure(Exception("test error"))

        self.assertEqual(cb.state, CircuitState.OPEN)
        self.assertFalse(cb.can_execute())

        with self.assertRaises(CircuitBreakerOpenException):
            cb.execute(lambda: "result")

        time.sleep(0.2)

        self.assertTrue(cb.can_execute())
        self.assertEqual(cb.state, CircuitState.HALF_OPEN)

        result = cb.execute(lambda: "success")
        self.assertEqual(result, "success")

        cb.on_success()
        cb.on_success()
        self.assertEqual(cb.state, CircuitState.CLOSED)

    def test_circuit_breaker_manager(self):
        """测试熔断器管理器"""
        manager = CircuitBreakerManager()

        cb1 = manager.get_or_create(
            name="device_1",
            failure_threshold=5,
            recovery_timeout=30.0,
        )
        self.assertIsNotNone(cb1)

        cb2 = manager.get("device_1")
        self.assertEqual(cb1, cb2)

        self.assertIn("device_1", manager.get_all_metrics())

        stats = manager.get_all_metrics()
        self.assertEqual(len(stats), 1)
        self.assertEqual(stats["device_1"]["name"], "device_1")

    def test_force_open_close(self):
        """测试强制打开和关闭"""
        cb = CircuitBreaker(name="test_cb")
        
        self.assertEqual(cb.state, CircuitState.CLOSED)
        
        cb.force_open()
        self.assertEqual(cb.state, CircuitState.OPEN)
        self.assertFalse(cb.can_execute())
        
        cb.force_close()
        self.assertEqual(cb.state, CircuitState.CLOSED)
        self.assertTrue(cb.can_execute())

    def test_get_metrics(self):
        """测试获取指标"""
        cb = CircuitBreaker(name="test_cb", failure_threshold=5)
        
        metrics = cb.get_metrics()
        self.assertEqual(metrics["name"], "test_cb")
        self.assertEqual(metrics["state"], "closed")
        self.assertEqual(metrics["failure_count"], 0)
        self.assertEqual(metrics["failure_threshold"], 5)


class TestProtocolDetector(unittest.TestCase):
    """协议检测测试"""

    def test_default_ports(self):
        """测试默认端口配置"""
        detector = ProtocolDetector()

        self.assertEqual(
            detector.DEFAULT_PORTS[ProtocolType.MODBUS_TCP], [502]
        )
        self.assertEqual(
            detector.DEFAULT_PORTS[ProtocolType.MQTT], [1883, 8883]
        )

    def test_protocol_compatibility_values(self):
        """测试协议兼容性值"""
        self.assertEqual(ProtocolCompatibility.FULL.value, "full")
        self.assertEqual(ProtocolCompatibility.PARTIAL.value, "partial")
        self.assertEqual(ProtocolCompatibility.NONE.value, "none")

    def test_detection_result_creation(self):
        """测试检测结果创建"""
        result = ProtocolDetectionResult(
            protocol=ProtocolType.MQTT,
            compatible=ProtocolCompatibility.FULL,
            latency_ms=50,
            details={"port": 1883},
        )
        self.assertEqual(result.protocol, ProtocolType.MQTT)
        self.assertEqual(result.compatible, ProtocolCompatibility.FULL)
        self.assertEqual(result.latency_ms, 50)
        
        result_dict = result.to_dict()
        self.assertEqual(result_dict["protocol"], "mqtt")
        self.assertEqual(result_dict["compatible"], "full")

    def test_protocol_features(self):
        """测试协议特性获取"""
        features = ProtocolCompatibilityChecker.get_protocol_features(ProtocolType.MODBUS_TCP)
        self.assertIn("default_port", features)
        self.assertEqual(features["default_port"], 502)
        
        features = ProtocolCompatibilityChecker.get_protocol_features(ProtocolType.MQTT)
        self.assertIn("qos_levels", features)

    @patch("socket.socket")
    def test_check_port_open(self, mock_socket_class):
        """测试端口检测"""
        mock_socket_instance = MagicMock()
        mock_socket_class.return_value = mock_socket_instance
        mock_socket_instance.__enter__ = MagicMock(return_value=mock_socket_instance)
        mock_socket_instance.__exit__ = MagicMock(return_value=False)

        detector = ProtocolDetector(timeout=1.0)

        mock_socket_instance.connect_ex.return_value = 0
        result = detector.check_port_open("192.168.1.1", 502)
        self.assertTrue(result)

        mock_socket_instance.connect_ex.return_value = 1
        result = detector.check_port_open("192.168.1.1", 502)
        self.assertFalse(result)


class TestRouterRefactor(unittest.TestCase):
    """路由调度重构测试"""

    def setUp(self):
        config_data = {
            "services": {
                "dataflow_router": {"host": "0.0.0.0", "port": 8002},
                "protocol_parser": {"host": "0.0.0.0", "port": 8001},
            }
        }
        self.config = MagicMock(spec=GatewayConfig)
        self.config.get.side_effect = lambda *args, **kwargs: (
            kwargs.get("default") 
            if args[-1] == "port" else 
            kwargs.get("default")
        )

    def test_route_rule_matching(self):
        """测试路由规则匹配"""
        rule1 = RouteRule(
            path_prefix="/api/dataflow/",
            target_port=8002,
            methods=["GET", "POST"],
        )
        
        self.assertTrue(rule1.matches("/api/dataflow/rules", "GET"))
        self.assertTrue(rule1.matches("/api/dataflow/execute", "POST"))
        self.assertFalse(rule1.matches("/api/dataflow/rules", "DELETE"))
        self.assertFalse(rule1.matches("/api/other/path", "GET"))

    def test_load_balancer(self):
        """测试负载均衡器"""
        lb = LoadBalancer()

        lb.add_instance("test_service", "localhost", 8001)
        lb.add_instance("test_service", "localhost", 8002)
        lb.add_instance("test_service", "localhost", 8003)

        ports = []
        for _ in range(6):
            result = lb.get_next("test_service")
            self.assertIsNotNone(result)
            ports.append(result[1])

        self.assertEqual(sorted(set(ports)), [8001, 8002, 8003])

        lb.remove_instance("test_service", "localhost", 8002)
        result = lb.get_next("test_service")
        self.assertIn(result[1], [8001, 8003])

    def test_path_rewriter(self):
        """测试路径重写器"""
        rewriter = PathRewriter()

        rewriter.add_rule("/old/api/", "/new/api/")
        rewriter.add_rule("/v1/", "/v2/")

        self.assertEqual(rewriter.rewrite("/old/api/users"), "/new/api/users")
        self.assertEqual(rewriter.rewrite("/v1/data"), "/v2/data")
        self.assertEqual(rewriter.rewrite("/other/path"), "/other/path")

    def test_request_router(self):
        """测试请求路由器"""
        router = RequestRouter(self.config)
        
        router.add_route("/test/", 9000)
        rule = router.find_route("/test/rules", "GET")
        
        self.assertIsNotNone(rule)
        self.assertEqual(rule.target_port, 9000)
        
        target = router.get_target("/test/execute", "POST")
        self.assertEqual(target, 9000)

    def test_router_manager(self):
        """测试路由管理器"""
        router = RouterManager(self.config)
        
        router.register_service("test_service", 9000)
        
        routes = router.get_stats()["routes"]
        self.assertTrue(any(r["path_prefix"] == "/test_service" for r in routes))


class TestBatchProcessor(unittest.TestCase):
    """批量处理优化测试"""

    def test_batch_collector(self):
        """测试批量收集器"""
        processed_batches = []

        def handler(batch: list) -> BatchResult:
            processed_batches.append(len(batch))
            return BatchResult(
                success=True,
                processed_count=len(batch),
                failed_count=0,
                total_latency_ms=10,
            )

        collector = BatchCollector(
            name="test",
            handler=handler,
            max_batch_size=5,
            max_wait_time=0.5,
        )
        collector.start()

        for i in range(7):
            collector.submit({"id": i})

        time.sleep(0.1)
        self.assertEqual(len(processed_batches), 1)
        self.assertEqual(processed_batches[0], 5)

        time.sleep(0.6)
        self.assertEqual(len(processed_batches), 2)
        self.assertEqual(processed_batches[1], 2)

        collector.stop()

    def test_async_processor(self):
        """测试异步处理器"""
        processor = AsyncProcessor(name="test", max_workers=2, max_queue_size=10)
        processor.start()

        results = []
        lock = threading.Lock()

        def task(x):
            time.sleep(0.01)
            return x * 2

        def callback(success, result, error):
            with lock:
                results.append(result)

        for i in range(5):
            processor.submit(lambda i=i: task(i), callback=callback)

        time.sleep(0.2)
        self.assertEqual(len(results), 5)
        self.assertEqual(sorted(results), [0, 2, 4, 6, 8])

        processor.stop()

    def test_data_compressor(self):
        """测试数据压缩器"""
        compressor = DataCompressor()

        data = {"test": "data", "value": 123, "list": [1, 2, 3]}
        compressed = compressor.compress(data)
        self.assertIsInstance(compressed, bytes)
        self.assertGreater(len(compressed), 0)

        decompressed = compressor.decompress(compressed)
        self.assertEqual(decompressed, data)

        large_data = {"items": [f"item_{i}" for i in range(1000)]}
        compressed_large = compressor.compress(large_data)
        import json
        original_size = len(json.dumps(large_data).encode("utf-8"))
        self.assertLess(len(compressed_large), original_size * 0.8)

    def test_connection_pool(self):
        """测试连接池"""
        created_connections = []

        def create_conn():
            conn = MagicMock()
            created_connections.append(conn)
            return conn

        pool = ConnectionPool(
            name="test",
            connection_factory=create_conn,
            max_connections=3,
        )

        conn1 = pool.acquire()
        conn2 = pool.acquire()
        conn3 = pool.acquire()

        self.assertEqual(len(created_connections), 3)

        pool.release(conn1)
        conn4 = pool.acquire()
        self.assertEqual(conn1, conn4)
        self.assertEqual(len(created_connections), 3)


class TestIntegration(unittest.TestCase):
    """集成测试 - 测试新功能在数据流引擎中的集成"""

    def setUp(self):
        self.engine = DataFlowEngine(enable_batch_processing=True, enable_async=True)

    def tearDown(self):
        self.engine.stop_processors()

    def test_circuit_breaker_integration(self):
        """测试熔断器在数据流引擎中的集成"""
        rule = DataFlowRule(
            rule_id="test_rule",
            rule_name="Test Rule",
            source_device="dev1",
            source_point="point1",
            target_device="dev2",
            target_point="point2",
            transform_expression="value * 2",
            trigger_condition="value > 10",
        )
        self.engine.add_rule(rule)

        stats = self.engine.get_circuit_breakers()
        self.assertIsInstance(stats, dict)

        stat_names = list(stats.keys())
        self.assertTrue(any("test_rule" in name for name in stat_names))
        self.assertTrue(any("dev1" in name for name in stat_names))

    def test_batch_processing_integration(self):
        """测试批量处理集成"""
        stats = self.engine.get_batch_stats()
        self.assertIn("running", stats)
        self.assertIn("total_batches", stats)

        stats = self.engine.get_async_stats()
        self.assertIn("running", stats)
        self.assertIn("total_tasks", stats)

    def test_async_execution(self):
        """测试异步执行"""
        callback_results = []

        def callback(success, results, error):
            callback_results.append((success, error))

        point = DataPoint(
            point_id="p1",
            device_id="dev1",
            point_name="test_point",
            value=20,
            metadata={"type": "test"},
        )

        success = self.engine.execute_async(point, callback=callback)
        self.assertTrue(success)

        time.sleep(0.1)
        self.assertEqual(len(callback_results), 1)


def run_tests():
    """运行所有测试"""
    print("=" * 70)
    print("系统升级综合测试")
    print("=" * 70)

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    suite.addTests(loader.loadTestsFromTestCase(TestCircuitBreaker))
    suite.addTests(loader.loadTestsFromTestCase(TestProtocolDetector))
    suite.addTests(loader.loadTestsFromTestCase(TestRouterRefactor))
    suite.addTests(loader.loadTestsFromTestCase(TestBatchProcessor))
    suite.addTests(loader.loadTestsFromTestCase(TestIntegration))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 70)
    print(f"测试结果: {'通过' if result.wasSuccessful() else '失败'}")
    print(f"运行测试: {result.testsRun}")
    print(f"失败: {len(result.failures)}")
    print(f"错误: {len(result.errors)}")
    print("=" * 70)

    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
