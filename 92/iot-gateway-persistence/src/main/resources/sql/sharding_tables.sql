-- ============================================
-- 分表存储方案 SQL 脚本
-- 支持按时间、设备ID哈希、组合策略分表
-- ============================================

USE iot_gateway;

-- ============================================
-- 1. 按月分表示例 (默认策略)
-- ============================================

-- 生成当前月份和未来12个月的分表
-- 表名格式: device_data_202401, device_data_202402, ...

DROP PROCEDURE IF EXISTS create_monthly_tables;

DELIMITER $$

CREATE PROCEDURE create_monthly_tables(IN table_prefix VARCHAR(64), IN months_ahead INT)
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE table_name VARCHAR(128);
    DECLARE current_date DATE;
    DECLARE target_date DATE;
    DECLARE suffix VARCHAR(16);
    DECLARE create_sql TEXT;

    SET current_date = CURDATE();

    WHILE i < months_ahead DO
        SET target_date = DATE_ADD(current_date, INTERVAL i MONTH);
        SET suffix = DATE_FORMAT(target_date, '%Y%m');
        SET table_name = CONCAT(table_prefix, suffix);

        SET create_sql = CONCAT(
            'CREATE TABLE IF NOT EXISTS `', table_name, '` (',
            '`id` bigint NOT NULL AUTO_INCREMENT COMMENT ''主键ID'',',
            '`device_id` varchar(64) NOT NULL COMMENT ''设备ID'',',
            '`message_id` varchar(64) DEFAULT NULL COMMENT ''消息ID'',',
            '`message_type` tinyint DEFAULT NULL COMMENT ''消息类型'',',
            '`payload` text COMMENT ''消息内容JSON'',',
            '`gateway_instance` varchar(128) DEFAULT NULL COMMENT ''网关实例'',',
            '`create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT ''创建时间'',',
            'PRIMARY KEY (`id`),',
            'KEY `idx_device_id` (`device_id`),',
            'KEY `idx_create_time` (`create_time`),',
            'KEY `idx_message_type` (`message_type`)',
            ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT=''设备数据表_', suffix, ''''
        );

        SET @sql = create_sql;
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;

        SET i = i + 1;
    END WHILE;

    SELECT CONCAT('Created ', months_ahead, ' monthly tables with prefix: ', table_prefix) AS result;
END$$

DELIMITER ;

-- 执行创建未来12个月的分表
CALL create_monthly_tables('device_data_', 12);


-- ============================================
-- 2. 按日分表示例
-- ============================================

DROP PROCEDURE IF EXISTS create_daily_tables;

DELIMITER $$

CREATE PROCEDURE create_daily_tables(IN table_prefix VARCHAR(64), IN days_ahead INT)
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE table_name VARCHAR(128);
    DECLARE current_date DATE;
    DECLARE target_date DATE;
    DECLARE suffix VARCHAR(16);
    DECLARE create_sql TEXT;

    SET current_date = CURDATE();

    WHILE i < days_ahead DO
        SET target_date = DATE_ADD(current_date, INTERVAL i DAY);
        SET suffix = DATE_FORMAT(target_date, '%Y%m%d');
        SET table_name = CONCAT(table_prefix, suffix);

        SET create_sql = CONCAT(
            'CREATE TABLE IF NOT EXISTS `', table_name, '` (',
            '`id` bigint NOT NULL AUTO_INCREMENT,',
            '`device_id` varchar(64) NOT NULL,',
            '`message_id` varchar(64) DEFAULT NULL,',
            '`message_type` tinyint DEFAULT NULL,',
            '`payload` text,',
            '`gateway_instance` varchar(128) DEFAULT NULL,',
            '`create_time` datetime DEFAULT CURRENT_TIMESTAMP,',
            'PRIMARY KEY (`id`),',
            'KEY `idx_device_id` (`device_id`),',
            'KEY `idx_create_time` (`create_time`),',
            'KEY `idx_message_type` (`message_type`)',
            ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
        );

        SET @sql = create_sql;
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;

        SET i = i + 1;
    END WHILE;

    SELECT CONCAT('Created ', days_ahead, ' daily tables with prefix: ', table_prefix) AS result;
END$$

DELIMITER ;


-- ============================================
-- 3. 按设备ID哈希分表示例 (固定16张表)
-- ============================================

DROP PROCEDURE IF EXISTS create_hash_tables;

DELIMITER $$

CREATE PROCEDURE create_hash_tables(IN table_prefix VARCHAR(64), IN modulo INT)
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE table_name VARCHAR(128);
    DECLARE suffix VARCHAR(16);
    DECLARE create_sql TEXT;

    WHILE i < modulo DO
        SET suffix = LPAD(CONVERT(i, CHAR), 2, '0');
        SET table_name = CONCAT(table_prefix, 'h', suffix);

        SET create_sql = CONCAT(
            'CREATE TABLE IF NOT EXISTS `', table_name, '` (',
            '`id` bigint NOT NULL AUTO_INCREMENT,',
            '`device_id` varchar(64) NOT NULL,',
            '`message_id` varchar(64) DEFAULT NULL,',
            '`message_type` tinyint DEFAULT NULL,',
            '`payload` text,',
            '`gateway_instance` varchar(128) DEFAULT NULL,',
            '`create_time` datetime DEFAULT CURRENT_TIMESTAMP,',
            'PRIMARY KEY (`id`),',
            'KEY `idx_device_id` (`device_id`),',
            'KEY `idx_create_time` (`create_time`),',
            'KEY `idx_message_type` (`message_type`)',
            ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
        );

        SET @sql = create_sql;
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;

        SET i = i + 1;
    END WHILE;

    SELECT CONCAT('Created ', modulo, ' hash tables with prefix: ', table_prefix) AS result;
END$$

DELIMITER ;

-- 执行创建16张哈希分表
-- CALL create_hash_tables('device_data_', 16);


-- ============================================
-- 4. 清理过期分表存储过程
-- ============================================

DROP PROCEDURE IF EXISTS cleanup_expired_tables;

DELIMITER $$

CREATE PROCEDURE cleanup_expired_tables(IN table_prefix VARCHAR(64), IN keep_months INT)
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE table_name VARCHAR(128);
    DECLARE suffix VARCHAR(16);
    DECLARE table_date DATE;
    DECLARE cutoff_date DATE;
    DECLARE drop_sql TEXT;

    DECLARE cur CURSOR FOR
        SELECT TABLE_NAME
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME LIKE CONCAT(table_prefix, '%')
          AND TABLE_NAME REGEXP CONCAT('^', table_prefix, '[0-9]{6}$')
        ORDER BY TABLE_NAME;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    SET cutoff_date = DATE_SUB(CURDATE(), INTERVAL keep_months MONTH);

    OPEN cur;

    read_loop: LOOP
        FETCH cur INTO table_name;
        IF done THEN
            LEAVE read_loop;
        END IF;

        SET suffix = SUBSTRING(table_name, LENGTH(table_prefix) + 1);

        IF LENGTH(suffix) = 6 THEN
            SET table_date = STR_TO_DATE(CONCAT(suffix, '01'), '%Y%m%d');
        ELSEIF LENGTH(suffix) = 8 THEN
            SET table_date = STR_TO_DATE(suffix, '%Y%m%d');
        ELSE
            ITERATE read_loop;
        END IF;

        IF table_date < cutoff_date THEN
            SET drop_sql = CONCAT('DROP TABLE IF EXISTS `', table_name, '`');
            SET @sql = drop_sql;
            PREPARE stmt FROM @sql;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
            SELECT CONCAT('Dropped expired table: ', table_name) AS log;
        END IF;
    END LOOP;

    CLOSE cur;

    SELECT CONCAT('Cleanup completed. Keep last ', keep_months, ' months.') AS result;
END$$

DELIMITER ;


-- ============================================
-- 5. 查询分表数据的视图 (可选)
-- ============================================

-- 创建分表查询视图（仅展示使用，实际查询建议走代码路由）
-- CREATE OR REPLACE VIEW v_device_data_all AS
-- SELECT * FROM device_data_202401
-- UNION ALL
-- SELECT * FROM device_data_202402
-- ...


-- ============================================
-- 6. 协议版本管理表 (可选持久化)
-- ============================================

CREATE TABLE IF NOT EXISTS iot_protocol_version (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    protocol_type TINYINT NOT NULL COMMENT '协议类型',
    version VARCHAR(32) NOT NULL COMMENT '协议版本号',
    version_name VARCHAR(64) DEFAULT NULL COMMENT '版本名称',
    description VARCHAR(255) DEFAULT NULL COMMENT '版本描述',
    codec_class_name VARCHAR(255) DEFAULT NULL COMMENT '编解码器类名',
    is_default TINYINT DEFAULT 0 COMMENT '是否默认版本 0:否 1:是',
    is_enabled TINYINT DEFAULT 1 COMMENT '是否启用 0:禁用 1:启用',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    extra_info TEXT COMMENT '扩展信息JSON',
    PRIMARY KEY (id),
    UNIQUE KEY uk_protocol_version (protocol_type, version),
    KEY idx_is_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='协议版本管理表';


-- ============================================
-- 7. 集群节点状态表 (可选持久化)
-- ============================================

CREATE TABLE IF NOT EXISTS iot_cluster_node (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    instance_id VARCHAR(128) NOT NULL COMMENT '节点实例ID',
    host VARCHAR(64) NOT NULL COMMENT '主机地址',
    port INT NOT NULL COMMENT '端口',
    status TINYINT DEFAULT 0 COMMENT '状态 0:运行 1:可疑 2:故障 3:已移除',
    register_time DATETIME DEFAULT NULL COMMENT '注册时间',
    last_heartbeat DATETIME DEFAULT NULL COMMENT '最后心跳时间',
    fail_time DATETIME DEFAULT NULL COMMENT '故障时间',
    remove_time DATETIME DEFAULT NULL COMMENT '移除时间',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_instance_id (instance_id),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='集群节点状态表';


-- ============================================
-- 初始化协议版本数据
-- ============================================

INSERT INTO iot_protocol_version (protocol_type, version, version_name, description, codec_class_name, is_default, is_enabled) VALUES
(5, '1.0', '自定义协议V1', '基础版本，CRC32校验', 'com.iot.gateway.codec.custom.CustomProtocolCodec', 0, 1),
(5, '2.0', '自定义协议V2', '优化版本，增强安全性', 'com.iot.gateway.codec.custom.CustomProtocolV2Codec', 1, 1)
ON DUPLICATE KEY UPDATE update_time = CURRENT_TIMESTAMP;
