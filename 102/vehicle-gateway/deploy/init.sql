CREATE DATABASE IF NOT EXISTS vehicle_gateway DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE vehicle_gateway;

CREATE TABLE IF NOT EXISTS terminal_devices (
    id VARCHAR(64) PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL UNIQUE,
    plate_number VARCHAR(32),
    region VARCHAR(32),
    device_type VARCHAR(32),
    protocol_type VARCHAR(32),
    iccid VARCHAR(32),
    imsi VARCHAR(32),
    manufacturer VARCHAR(64),
    model VARCHAR(64),
    firmware_ver VARCHAR(32),
    auth_token VARCHAR(128),
    status INT DEFAULT 1,
    online_status INT DEFAULT 0,
    last_online_at DATETIME,
    last_heartbeat DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_device_id (device_id),
    INDEX idx_plate_number (plate_number),
    INDEX idx_region (region),
    INDEX idx_status (status),
    INDEX idx_online_status (online_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicle_data (
    id VARCHAR(64) PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    plate_number VARCHAR(32),
    region VARCHAR(32),
    protocol_type VARCHAR(32),
    msg_type VARCHAR(32),
    timestamp DATETIME,
    latitude DOUBLE,
    longitude DOUBLE,
    speed DOUBLE,
    direction DOUBLE,
    altitude DOUBLE,
    mileage DOUBLE,
    fuel_level DOUBLE,
    status INT,
    alarm_flags BIGINT UNSIGNED,
    raw_data BLOB,
    extra_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device_id (device_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_region (region),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicle_data_00 LIKE vehicle_data;
CREATE TABLE IF NOT EXISTS vehicle_data_01 LIKE vehicle_data;
CREATE TABLE IF NOT EXISTS vehicle_data_02 LIKE vehicle_data;
CREATE TABLE IF NOT EXISTS vehicle_data_03 LIKE vehicle_data;

INSERT INTO terminal_devices (id, device_id, plate_number, region, protocol_type, auth_token, status) 
VALUES 
('1', '000000000001', '京A12345', 'north', 'JT808', 'e10adc3949ba59abbe56e057f20f883e', 1),
('2', '000000000002', '沪B67890', 'east', 'JT808', 'e10adc3949ba59abbe56e057f20f883e', 1),
('3', '000000000003', '粤C11111', 'south', 'JT808', 'e10adc3949ba59abbe56e057f20f883e', 1);
