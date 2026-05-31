CREATE TABLE IF NOT EXISTS message_formats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  format_name VARCHAR(100) NOT NULL UNIQUE,
  format_type ENUM('json', 'csv', 'xml', 'custom') NOT NULL DEFAULT 'json',
  field_mapping JSON NOT NULL,
  validation_rules JSON,
  transform_rules JSON,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_format_name (format_name),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS export_tasks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL UNIQUE,
  format VARCHAR(20) NOT NULL DEFAULT 'csv',
  status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  filters JSON,
  file_path VARCHAR(255),
  file_size BIGINT DEFAULT 0,
  record_count INT DEFAULT 0,
  error_message TEXT,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX idx_task_id (task_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cluster_nodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(100) NOT NULL UNIQUE,
  node_type ENUM('gateway', 'collector', 'persistence') NOT NULL,
  host VARCHAR(100) NOT NULL,
  port INT NOT NULL,
  weight INT DEFAULT 10,
  status ENUM('active', 'standby', 'failed', 'maintenance') NOT NULL DEFAULT 'standby',
  health_status ENUM('healthy', 'degraded', 'unhealthy') NOT NULL DEFAULT 'unhealthy',
  last_health_check TIMESTAMP NULL,
  failover_count INT DEFAULT 0,
  last_failover_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_node_type (node_type),
  INDEX idx_status (status),
  INDEX idx_health_status (health_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS write_performance_stats (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  operation_type VARCHAR(50) NOT NULL,
  batch_size INT NOT NULL,
  duration_ms INT NOT NULL,
  records_processed INT NOT NULL,
  success_count INT NOT NULL,
  failed_count INT NOT NULL,
  method VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_operation_type (operation_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO message_formats (format_name, format_type, field_mapping, validation_rules, transform_rules, is_active) VALUES
('default_heartbeat', 'json', 
 '{"nodeId":"nodeId","groupId":"groupId","region":"region","cpu":"cpu","memory":"memory","bandwidth":"bandwidth","uptime":"uptime","status":"status","timestamp":"timestamp"}',
 '{"required":["nodeId","status"],"cpu":{"min":0,"max":100},"memory":{"min":0,"max":100}}',
 '{"cpu":"toFixed(2)","memory":"toFixed(2)","bandwidth":"toFixed(2)"}',
 1),
('custom_snmp', 'json',
 '{"device_id":"nodeId","device_group":"groupId","location":"region","cpu_util":"cpu","mem_util":"memory","bw_usage":"bandwidth","sys_uptime":"uptime","op_status":"status"}',
 '{"required":["device_id","op_status"]}',
 '{"op_status":{"1":"online","0":"offline","2":"warning"}}',
 1),
('legacy_csv', 'csv',
 '["nodeId","groupId","region","cpu","memory","bandwidth","uptime","status","timestamp"]',
 '{"delimiter":",","hasHeader":true}',
 '{"status":{"ON":"online","OFF":"offline","WRN":"warning"}}',
 1)
ON DUPLICATE KEY UPDATE field_mapping = VALUES(field_mapping);

INSERT INTO cluster_nodes (node_id, node_type, host, port, weight, status, health_status) VALUES
('gateway-primary', 'gateway', 'localhost', 3001, 100, 'active', 'healthy'),
('gateway-standby', 'gateway', 'localhost', 3011, 80, 'standby', 'healthy'),
('persistence-primary', 'persistence', 'localhost', 3003, 100, 'active', 'healthy'),
('persistence-standby', 'persistence', 'localhost', 3013, 80, 'standby', 'healthy'),
('collector-1', 'collector', 'localhost', 3002, 100, 'active', 'healthy'),
('collector-2', 'collector', 'localhost', 3012, 90, 'active', 'healthy')
ON DUPLICATE KEY UPDATE health_status = VALUES(health_status);
