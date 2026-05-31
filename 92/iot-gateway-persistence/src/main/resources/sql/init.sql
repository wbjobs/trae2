CREATE DATABASE IF NOT EXISTS iot_gateway DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE iot_gateway;

CREATE TABLE IF NOT EXISTS iot_device_info (
    device_id VARCHAR(64) NOT NULL COMMENT '设备ID',
    device_name VARCHAR(128) DEFAULT NULL COMMENT '设备名称',
    protocol_type TINYINT DEFAULT NULL COMMENT '协议类型 1:Modbus RTU 2:Modbus TCP 3:LoRa 4:MQTT 5:自定义',
    product_key VARCHAR(64) DEFAULT NULL COMMENT '产品Key',
    device_secret VARCHAR(128) DEFAULT NULL COMMENT '设备密钥',
    status TINYINT DEFAULT 0 COMMENT '设备状态 0:离线 1:在线',
    last_ip VARCHAR(32) DEFAULT NULL COMMENT '最后上线IP',
    last_port INT DEFAULT NULL COMMENT '最后上线端口',
    last_online_time DATETIME DEFAULT NULL COMMENT '最后上线时间',
    last_offline_time DATETIME DEFAULT NULL COMMENT '最后离线时间',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    extra_info TEXT COMMENT '扩展信息JSON',
    PRIMARY KEY (device_id),
    KEY idx_status (status),
    KEY idx_protocol_type (protocol_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备信息表';

CREATE TABLE IF NOT EXISTS iot_device_data (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    device_id VARCHAR(64) NOT NULL COMMENT '设备ID',
    message_id VARCHAR(64) DEFAULT NULL COMMENT '消息ID',
    message_type TINYINT DEFAULT NULL COMMENT '消息类型',
    payload TEXT COMMENT '消息内容JSON',
    gateway_instance VARCHAR(128) DEFAULT NULL COMMENT '网关实例',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    KEY idx_device_id (device_id),
    KEY idx_create_time (create_time),
    KEY idx_message_type (message_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备数据表';

CREATE TABLE IF NOT EXISTS iot_command_log (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    device_id VARCHAR(64) NOT NULL COMMENT '设备ID',
    command_id VARCHAR(64) DEFAULT NULL COMMENT '命令ID',
    command_type VARCHAR(64) DEFAULT NULL COMMENT '命令类型',
    params TEXT COMMENT '命令参数JSON',
    status TINYINT DEFAULT 0 COMMENT '状态 0:待发送 1:已发送 2:已响应 3:超时 4:失败',
    result TEXT COMMENT '执行结果JSON',
    send_time DATETIME DEFAULT NULL COMMENT '发送时间',
    ack_time DATETIME DEFAULT NULL COMMENT '响应时间',
    gateway_instance VARCHAR(128) DEFAULT NULL COMMENT '网关实例',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    KEY idx_device_id (device_id),
    KEY idx_status (status),
    KEY idx_send_time (send_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='命令日志表';
