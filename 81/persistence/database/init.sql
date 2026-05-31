CREATE DATABASE IF NOT EXISTS telemetry_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE telemetry_db;

CREATE TABLE IF NOT EXISTS nodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(100) NOT NULL UNIQUE,
  group_id VARCHAR(50) NOT NULL,
  region VARCHAR(50) NOT NULL,
  last_status ENUM('online', 'offline', 'warning') DEFAULT 'offline',
  last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_node_id (node_id),
  INDEX idx_group_id (group_id),
  INDEX idx_region (region),
  INDEX idx_status (last_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS node_metrics (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(100) NOT NULL,
  group_id VARCHAR(50) NOT NULL,
  region VARCHAR(50) NOT NULL,
  cpu_usage DECIMAL(5,2) NOT NULL,
  memory_usage DECIMAL(5,2) NOT NULL,
  bandwidth_usage DECIMAL(10,2) NOT NULL,
  uptime BIGINT NOT NULL,
  status ENUM('online', 'offline', 'warning') NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_node_id (node_id),
  INDEX idx_timestamp (timestamp),
  INDEX idx_group_time (group_id, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS node_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id VARCHAR(50) NOT NULL UNIQUE,
  group_name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO node_groups (group_id, group_name, description) VALUES
('group-east', '东部区域节点组', '负责华东地区的边缘节点'),
('group-west', '西部区域节点组', '负责西部地区的边缘节点'),
('group-south', '南部区域节点组', '负责华南地区的边缘节点'),
('group-north', '北部区域节点组', '负责华北地区的边缘节点')
ON DUPLICATE KEY UPDATE group_name = VALUES(group_name);
