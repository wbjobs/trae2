"""
工业边缘网关 - 测试脚本
用于验证各模块功能是否正常
"""
import sys
import json
import time
import importlib
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

shared_src = importlib.import_module("shared.src")
load_config = shared_src.config.load_config
DataPoint = shared_src.models.DataPoint
DeviceInfo = shared_src.models.DeviceInfo
ProtocolType = shared_src.models.ProtocolType
DataFlowRule = shared_src.models.DataFlowRule
Message = shared_src.models.Message

logger_module = importlib.import_module("shared.src.logger")
get_logger = logger_module.get_logger

logger = get_logger("test")


def test_config():
    print("\n[测试] 配置模块...")
    try:
        config = load_config(str(BASE_DIR / "config" / "gateway_config.json"))
        assert config.environment == "edge"
        assert config.is_edge == True
        assert config.is_cloud == False
        print(f"  ✓ 配置加载成功 (环境: {config.environment})")
        return True
    except Exception as e:
        print(f"  ✗ 配置测试失败: {e}")
        return False


def test_models():
    print("\n[测试] 数据模型...")
    try:
        point = DataPoint(
            device_id="test-device",
            point_name="测试点",
            address="0",
            data_type="float32",
            value=100.5,
        )
        assert point.value == 100.5
        assert point.quality == "good"
        
        device = DeviceInfo(
            device_name="测试设备",
            protocol=ProtocolType.MODBUS_TCP,
            ip_address="192.168.1.100",
        )
        assert device.device_name == "测试设备"
        assert device.protocol == ProtocolType.MODBUS_TCP
        
        rule = DataFlowRule(
            rule_name="测试规则",
            source_device="dev-001",
            target_device="cloud",
        )
        assert rule.rule_name == "测试规则"
        assert rule.enabled == True
        
        print("  ✓ 数据模型测试通过")
        return True
    except Exception as e:
        print(f"  ✗ 数据模型测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_protocol_parser():
    print("\n[测试] 协议解析模块...")
    try:
        import importlib.util
        import sys
        
        base_dir = Path(__file__).parent.parent
        
        protocol_parser_spec = importlib.util.spec_from_file_location(
            "protocol_parser", str(base_dir / "protocol-parser" / "__init__.py")
        )
        protocol_parser = importlib.util.module_from_spec(protocol_parser_spec)
        sys.modules["protocol_parser"] = protocol_parser
        protocol_parser_spec.loader.exec_module(protocol_parser)
        
        base_spec = importlib.util.spec_from_file_location(
            "protocol_parser.src.base", str(base_dir / "protocol-parser" / "src" / "base.py")
        )
        base_module = importlib.util.module_from_spec(base_spec)
        sys.modules["protocol_parser.src.base"] = base_module
        base_spec.loader.exec_module(base_module)
        
        modbus_spec = importlib.util.spec_from_file_location(
            "protocol_parser.src.modbus_parser", str(base_dir / "protocol-parser" / "src" / "modbus_parser.py")
        )
        modbus_module = importlib.util.module_from_spec(modbus_spec)
        sys.modules["protocol_parser.src.modbus_parser"] = modbus_module
        modbus_spec.loader.exec_module(modbus_module)
        
        ProtocolFactory = base_module.ProtocolFactory
        ModbusTCPParser = modbus_module.ModbusTCPParser
        
        supported = ProtocolFactory.get_supported_protocols()
        assert "modbus_tcp" in supported
        print(f"  ✓ 支持的协议: {supported}")
        
        parser = ProtocolFactory.create(ProtocolType.MODBUS_TCP)
        assert isinstance(parser, ModbusTCPParser)
        print("  ✓ Modbus TCP 解析器创建成功")
        
        register_count = ModbusTCPParser._get_register_count("float32")
        assert register_count == 2
        print(f"  ✓ 寄存器数量计算正确 (float32={register_count})")
        
        print("  ✓ 协议解析模块测试通过")
        return True
    except Exception as e:
        print(f"  ✗ 协议解析模块测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_dataflow_engine():
    print("\n[测试] 数据流引擎...")
    try:
        dataflow_engine = importlib.import_module("dataflow-router.src.engine")
        
        DataFlowEngine = dataflow_engine.DataFlowEngine
        TransformEngine = dataflow_engine.TransformEngine
        
        transform = TransformEngine()
        result = transform.transform("value * 2 + 10", {"value": 5})
        assert result == 20
        print(f"  ✓ 转换表达式计算正确 (5 * 2 + 10 = {result})")
        
        result = transform.transform("value > 100", {"value": 150})
        assert result == True
        print(f"  ✓ 条件表达式计算正确 (150 > 100 = {result})")
        
        engine = DataFlowEngine()
        rule = DataFlowRule(
            rule_name="测试转换",
            source_device="dev-001",
            source_point="0",
            target_device="cloud",
            target_point="temp",
            transform_expression="value * 1.8 + 32",
        )
        engine.add_rule(rule)
        assert len(engine.get_rules()) == 1
        print("  ✓ 规则添加成功")
        
        point = DataPoint(
            device_id="dev-001",
            point_id="0",
            value=25.0,
        )
        results = engine.execute(point)
        assert len(results) == 1
        assert abs(results[0].value - 77.0) < 0.01
        print(f"  ✓ 规则执行成功 (25°C = {results[0].value}°F)")
        
        stats = engine.get_stats()
        assert stats["total_rules"] == 1
        print(f"  ✓ 统计信息正确: {stats}")
        
        print("  ✓ 数据流引擎测试通过")
        return True
    except Exception as e:
        print(f"  ✗ 数据流引擎测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_storage():
    print("\n[测试] 数据存储模块...")
    try:
        time_series_db = importlib.import_module("data-storage.src.time_series_db")
        storage_engine = importlib.import_module("data-storage.src.storage_engine")
        
        SQLiteAdapter = time_series_db.SQLiteAdapter
        StorageEngine = storage_engine.StorageEngine
        
        db = SQLiteAdapter(":memory:")
        assert db is not None
        print("  ✓ SQLite 适配器创建成功")
        
        config = load_config(str(BASE_DIR / "config" / "gateway_config.json"))
        engine = StorageEngine(config, db)
        
        engine.bucket_manager.create_bucket("test_bucket", "测试分桶")
        buckets = engine.bucket_manager.get_all_buckets()
        assert "test_bucket" in buckets
        print("  ✓ 分桶创建成功")
        
        point = DataPoint(
            device_id="dev-001",
            point_id="0",
            value=100.5,
        )
        result = engine.write_point("test_bucket", "temperature", point)
        assert result == True
        print("  ✓ 数据写入成功")
        
        engine.flush()
        
        from datetime import datetime, timedelta
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=1)
        results = engine.query("test_bucket", "temperature", start_time, end_time)
        assert len(results) > 0
        print(f"  ✓ 数据查询成功 (返回 {len(results)} 条记录)")
        
        latest = engine.query_latest("test_bucket", "temperature")
        assert latest is not None
        print(f"  ✓ 查询最新数据成功")
        
        db.close()
        print("  ✓ 数据存储模块测试通过")
        return True
    except Exception as e:
        print(f"  ✗ 数据存储模块测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_message_bus():
    print("\n[测试] 消息总线...")
    try:
        message_bus_module = importlib.import_module("cross-node-communication.src.message_bus")
        MessageBus = message_bus_module.MessageBus
        Message = shared_src.models.Message
        
        bus = MessageBus()
        
        received_messages = []
        
        def callback(message):
            received_messages.append(message)
        
        bus.subscribe("test/topic", callback)
        assert len(bus.get_subscribers()["test/topic"]) == 1
        print("  ✓ 消息订阅成功")
        
        msg = Message(
            msg_type="test",
            source="test",
            target="all",
            payload={"data": "test_data"},
        )
        bus.publish("test/topic", msg)
        
        time.sleep(0.1)
        assert len(received_messages) == 1
        assert received_messages[0].payload["data"] == "test_data"
        print("  ✓ 消息发布和接收成功")
        
        stats = bus.get_stats()
        assert stats["total_messages"] == 1
        print(f"  ✓ 消息总线统计正确: {stats}")
        
        print("  ✓ 消息总线测试通过")
        return True
    except Exception as e:
        print(f"  ✗ 消息总线测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("=" * 50)
    print("工业边缘网关 - 功能测试")
    print("=" * 50)
    
    tests = [
        test_config,
        test_models,
        test_protocol_parser,
        test_dataflow_engine,
        test_storage,
        test_message_bus,
    ]
    
    results = []
    for test in tests:
        result = test()
        results.append(result)
    
    print("\n" + "=" * 50)
    passed = sum(1 for r in results if r)
    total = len(results)
    print(f"测试结果: {passed}/{total} 通过")
    
    if all(results):
        print("✓ 所有测试通过!")
    else:
        print("✗ 部分测试失败, 请检查日志")
    
    print("=" * 50)
    
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())