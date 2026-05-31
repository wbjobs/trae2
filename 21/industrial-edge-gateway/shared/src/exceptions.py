"""
自定义异常定义
"""


class GatewayException(Exception):
    """网关基础异常"""
    def __init__(self, message: str = "", error_code: str = "GATEWAY_ERROR"):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)


class ProtocolParseException(GatewayException):
    """协议解析异常"""
    def __init__(self, message: str = "协议解析失败", protocol: str = ""):
        self.protocol = protocol
        super().__init__(message=message, error_code="PROTOCOL_PARSE_ERROR")


class DataFlowException(GatewayException):
    """数据流处理异常"""
    def __init__(self, message: str = "数据流处理失败", rule_id: str = ""):
        self.rule_id = rule_id
        super().__init__(message=message, error_code="DATA_FLOW_ERROR")


class StorageException(GatewayException):
    """数据存储异常"""
    def __init__(self, message: str = "数据存储失败", storage_type: str = ""):
        self.storage_type = storage_type
        super().__init__(message=message, error_code="STORAGE_ERROR")


class CommunicationException(GatewayException):
    """通信异常"""
    def __init__(self, message: str = "通信失败", target: str = ""):
        self.target = target
        super().__init__(message=message, error_code="COMMUNICATION_ERROR")


class DeviceConnectionException(GatewayException):
    """设备连接异常"""
    def __init__(self, message: str = "设备连接失败", device_id: str = ""):
        self.device_id = device_id
        super().__init__(message=message, error_code="DEVICE_CONNECTION_ERROR")


class ConfigurationException(GatewayException):
    """配置异常"""
    def __init__(self, message: str = "配置错误", config_key: str = ""):
        self.config_key = config_key
        super().__init__(message=message, error_code="CONFIG_ERROR")