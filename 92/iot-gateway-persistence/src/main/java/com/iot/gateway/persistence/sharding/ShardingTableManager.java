package com.iot.gateway.persistence.sharding;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class ShardingTableManager {

    private static final DateTimeFormatter DAY_FORMATTER = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter MONTH_FORMATTER = DateTimeFormatter.ofPattern("yyyyMM");
    private static final DateTimeFormatter YEAR_FORMATTER = DateTimeFormatter.ofPattern("yyyy");

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ShardingTableProperties properties;

    private final ConcurrentHashMap<String, Boolean> tableExistsCache = new ConcurrentHashMap<>();

    private final Object createLock = new Object();

    @PostConstruct
    public void init() {
        if (!properties.isEnabled()) {
            log.info("分表功能未启用");
            return;
        }
        log.info("分表管理器初始化完成, 策略: {}, 表前缀: {}, 自动建表: {}",
                properties.getStrategy(), properties.getTablePrefix(), properties.isAutoCreateTable());

        if (properties.isAutoCreateTable()) {
            preCreateTables();
        }
    }

    @Scheduled(cron = "0 0 1 * * ?")
    public void scheduledPreCreateTables() {
        if (properties.isEnabled() && properties.isAutoCreateTable()) {
            log.info("定时任务: 预创建分表");
            preCreateTables();
        }
    }

    public String getActualTableName(String deviceId, LocalDateTime timestamp) {
        if (!properties.isEnabled()) {
            return "device_data";
        }
        if (timestamp == null) {
            timestamp = LocalDateTime.now();
        }
        LocalDate date = timestamp.toLocalDate();
        String suffix = getTableSuffix(date, deviceId);
        return properties.getTablePrefix() + suffix;
    }

    private String getTableSuffix(LocalDate date, String deviceId) {
        ShardingTableProperties.Strategy strategy = properties.getStrategyEnum();
        switch (strategy) {
            case DAY:
                return date.format(DAY_FORMATTER);
            case MONTH:
                return date.format(MONTH_FORMATTER);
            case YEAR:
                return date.format(YEAR_FORMATTER);
            case HASH_DEVICE_ID:
                int hash = Math.abs(deviceId.hashCode()) % properties.getHashModulo();
                return String.format("h%02d", hash);
            case HASH_DEVICE_ID_DAY:
                int h = Math.abs(deviceId.hashCode()) % properties.getHashModulo();
                return String.format("h%02d_%s", h, date.format(DAY_FORMATTER));
            default:
                return date.format(MONTH_FORMATTER);
        }
    }

    public void ensureTableExists(String tableName) {
        if (!properties.isEnabled() || jdbcTemplate == null) {
            return;
        }
        if (tableExistsCache.contains(tableName)) {
            return;
        }
        synchronized (createLock) {
            if (tableExistsCache.contains(tableName)) {
                return;
            }
            try {
                String checkSql = "SELECT COUNT(*) FROM information_schema.TABLES " +
                        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?";
                Integer count = jdbcTemplate.queryForObject(checkSql, Integer.class, tableName);
                if (count != null && count > 0) {
                    tableExistsCache.put(tableName, true);
                    return;
                }
                createTable(tableName);
                tableExistsCache.put(tableName, true);
                log.info("自动创建分表成功: {}", tableName);
            } catch (Exception e) {
                log.error("创建分表失败: {}", tableName, e);
                tableExistsCache.put(tableName, false);
            }
        }
    }

    private void createTable(String tableName) {
        String createSql = "CREATE TABLE IF NOT EXISTS `" + tableName + "` (" +
                "`id` bigint NOT NULL AUTO_INCREMENT," +
                "`device_id` varchar(64) NOT NULL," +
                "`message_id` varchar(64) DEFAULT NULL," +
                "`message_type` tinyint DEFAULT NULL," +
                "`payload` text," +
                "`gateway_instance` varchar(128) DEFAULT NULL," +
                "`create_time` datetime DEFAULT CURRENT_TIMESTAMP," +
                "PRIMARY KEY (`id`)," +
                "KEY `idx_device_id` (`device_id`)," +
                "KEY `idx_create_time` (`create_time`)," +
                "KEY `idx_message_type` (`message_type`)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci";
        jdbcTemplate.execute(createSql);
    }

    public void preCreateTables() {
        if (!properties.isAutoCreateTable() || jdbcTemplate == null) {
            return;
        }
        List<String> tableNames = generateFutureTableNames();
        for (String tableName : tableNames) {
            ensureTableExists(tableName);
        }
    }

    private List<String> generateFutureTableNames() {
        List<String> names = new ArrayList<>();
        LocalDate now = LocalDate.now();
        int months = Math.max(2, properties.getKeepMonths());
        switch (properties.getStrategyEnum()) {
            case DAY:
                for (int i = 0; i < 7; i++) {
                    LocalDate date = now.plusDays(i);
                    names.add(properties.getTablePrefix() + date.format(DAY_FORMATTER));
                }
                break;
            case MONTH:
            case HASH_DEVICE_ID_DAY:
                for (int i = 0; i < months; i++) {
                    LocalDate date = now.plusMonths(i);
                    names.add(properties.getTablePrefix() + date.format(MONTH_FORMATTER));
                }
                break;
            case YEAR:
                for (int i = 0; i < 3; i++) {
                    LocalDate date = now.plusYears(i);
                    names.add(properties.getTablePrefix() + date.format(YEAR_FORMATTER));
                }
                break;
            case HASH_DEVICE_ID:
                for (int i = 0; i < properties.getHashModulo(); i++) {
                    names.add(properties.getTablePrefix() + String.format("h%02d", i));
                }
                break;
        }
        return names;
    }

    public void clearExpiredTables() {
        if (!properties.isEnabled() || jdbcTemplate == null || properties.getKeepMonths() <= 0) {
            return;
        }
        log.info("清理过期分表, 保留最近{}个月", properties.getKeepMonths());
        LocalDate cutoffDate = LocalDate.now().minusMonths(properties.getKeepMonths());
        String checkSql = "SELECT TABLE_NAME FROM information_schema.TABLES " +
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE ?";
        List<String> tables = jdbcTemplate.queryForList(checkSql,
                String.class, properties.getTablePrefix() + "%");
        int deleted = 0;
        for (String table : tables) {
            if (shouldDropTable(table, cutoffDate)) {
                try {
                    jdbcTemplate.execute("DROP TABLE IF EXISTS `" + table + "`");
                    tableExistsCache.remove(table);
                    log.info("已删除过期分表: {}", table);
                    deleted++;
                } catch (Exception e) {
                    log.error("删除过期分表失败: {}", table, e);
                }
            }
        }
        log.info("过期分表清理完成, 共删除{}张表", deleted);
    }

    private boolean shouldDropTable(String tableName, LocalDate cutoffDate) {
        try {
            String suffix = tableName.substring(properties.getTablePrefix().length());
            ShardingTableProperties.Strategy strategy = properties.getStrategyEnum();
            if (strategy == ShardingTableProperties.Strategy.HASH_DEVICE_ID) {
                return false;
            }
            if (strategy == ShardingTableProperties.Strategy.HASH_DEVICE_ID_DAY) {
                int idx = suffix.indexOf('_');
                if (idx > 0 && idx < suffix.length() - 1) {
                    suffix = suffix.substring(idx + 1);
                }
            }
            LocalDate tableDate;
            if (suffix.length() == 8) {
                tableDate = LocalDate.parse(suffix, DAY_FORMATTER);
            } else if (suffix.length() == 6) {
                tableDate = LocalDate.parse(suffix + "01", DAY_FORMATTER);
            } else if (suffix.length() == 4) {
                tableDate = LocalDate.parse(suffix + "0101", DAY_FORMATTER);
            } else {
                return false;
            }
            return tableDate.isBefore(cutoffDate);
        } catch (Exception e) {
            log.warn("解析分表名失败: {}", tableName, e);
            return false;
        }
    }

    public boolean isShardingEnabled() {
        return properties.isEnabled();
    }
}
