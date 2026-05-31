package com.iot.gateway.api.controller;

import com.iot.gateway.common.model.R;
import com.iot.gateway.persistence.service.DevicePersistenceService;
import com.iot.gateway.persistence.sharding.ShardingTableManager;
import com.iot.gateway.persistence.sharding.ShardingTableProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/sharding")
public class ShardingTableController {

    @Autowired(required = false)
    private ShardingTableManager shardingTableManager;

    @Autowired(required = false)
    private ShardingTableProperties shardingProperties;

    @Autowired
    private DevicePersistenceService persistenceService;

    @GetMapping("/config")
    public R<Map<String, Object>> getShardingConfig() {
        if (shardingProperties == null) {
            return R.error("分表配置未加载");
        }
        Map<String, Object> result = new HashMap<>();
        result.put("enabled", shardingProperties.isEnabled());
        result.put("strategy", shardingProperties.getStrategy());
        result.put("strategyEnum", shardingProperties.getStrategyEnum().name());
        result.put("tablePrefix", shardingProperties.getTablePrefix());
        result.put("autoCreateTable", shardingProperties.isAutoCreateTable());
        result.put("keepMonths", shardingProperties.getKeepMonths());
        result.put("hashModulo", shardingProperties.getHashModulo());
        return R.ok(result);
    }

    @GetMapping("/table/{deviceId}")
    public R<Map<String, Object>> getTableName(
            @PathVariable String deviceId,
            @RequestParam(required = false) Long timestamp) {
        if (shardingTableManager == null || !shardingTableManager.isShardingEnabled()) {
            Map<String, Object> result = new HashMap<>();
            result.put("shardingEnabled", false);
            result.put("tableName", "device_data");
            return R.ok(result);
        }
        LocalDateTime time = timestamp != null ?
                LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(timestamp),
                        java.time.ZoneId.systemDefault()) : LocalDateTime.now();
        String tableName = shardingTableManager.getActualTableName(deviceId, time);
        Map<String, Object> result = new HashMap<>();
        result.put("shardingEnabled", true);
        result.put("deviceId", deviceId);
        result.put("timestamp", timestamp);
        result.put("tableName", tableName);
        result.put("date", time.toString());
        return R.ok(result);
    }

    @PostMapping("/precreate")
    public R<Map<String, Object>> preCreateTables() {
        if (shardingTableManager == null || !shardingTableManager.isShardingEnabled()) {
            return R.error("分表功能未启用");
        }
        long startTime = System.currentTimeMillis();
        shardingTableManager.preCreateTables();
        Map<String, Object> result = new HashMap<>();
        result.put("message", "分表预创建完成");
        result.put("costTime", System.currentTimeMillis() - startTime);
        return R.ok(result);
    }

    @PostMapping("/clear-expired")
    public R<Map<String, Object>> clearExpiredTables() {
        if (shardingTableManager == null || !shardingTableManager.isShardingEnabled()) {
            return R.error("分表功能未启用");
        }
        long startTime = System.currentTimeMillis();
        shardingTableManager.clearExpiredTables();
        Map<String, Object> result = new HashMap<>();
        result.put("message", "过期分表清理完成");
        result.put("keepMonths", shardingProperties != null ? shardingProperties.getKeepMonths() : 12);
        result.put("costTime", System.currentTimeMillis() - startTime);
        return R.ok(result);
    }

    @PostMapping("/ensure/{tableName}")
    public R<Map<String, Object>> ensureTableExists(@PathVariable String tableName) {
        if (shardingTableManager == null || !shardingTableManager.isShardingEnabled()) {
            return R.error("分表功能未启用");
        }
        long startTime = System.currentTimeMillis();
        shardingTableManager.ensureTableExists(tableName);
        Map<String, Object> result = new HashMap<>();
        result.put("tableName", tableName);
        result.put("exists", true);
        result.put("costTime", System.currentTimeMillis() - startTime);
        return R.ok(result);
    }

    @GetMapping("/status")
    public R<Map<String, Object>> getShardingStatus() {
        Map<String, Object> result = new HashMap<>();
        boolean enabled = shardingTableManager != null && shardingTableManager.isShardingEnabled();
        result.put("enabled", enabled);
        result.put("queueSize", persistenceService.getQueueSize());
        result.put("persistenceService", "active");
        return R.ok(result);
    }
}
