package com.iot.gateway.persistence.sharding;

import com.baomidou.mybatisplus.core.handlers.StrictTableInfoHandler;
import com.baomidou.mybatisplus.core.metadata.TableInfo;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class DynamicTableNameHandler implements StrictTableInfoHandler {

    private static final ThreadLocal<String> CURRENT_TABLE_NAME = new ThreadLocal<>();
    private static final ThreadLocal<Boolean> USE_SHARDING = new ThreadLocal<>();

    @Autowired
    private ShardingTableManager shardingTableManager;

    public static void setCurrentTableName(String tableName) {
        CURRENT_TABLE_NAME.set(tableName);
    }

    public static void setUseSharding(boolean use) {
        USE_SHARDING.set(use);
    }

    public static void clear() {
        CURRENT_TABLE_NAME.remove();
        USE_SHARDING.remove();
    }

    @Override
    public String buildTableName(Class<?> entityClass, String tableName) {
        Boolean useSharding = USE_SHARDING.get();
        if (useSharding == null || !useSharding || !shardingTableManager.isShardingEnabled()) {
            return tableName;
        }
        String dynamicTable = CURRENT_TABLE_NAME.get();
        if (dynamicTable != null && !dynamicTable.isEmpty()) {
            if (log.isDebugEnabled()) {
                log.debug("动态表名: {} -> {}", tableName, dynamicTable);
            }
            shardingTableManager.ensureTableExists(dynamicTable);
            return dynamicTable;
        }
        return tableName;
    }

    public static String executeWithSharding(String actualTable, Runnable task) {
        try {
            setUseSharding(true);
            setCurrentTableName(actualTable);
            task.run();
            return actualTable;
        } finally {
            clear();
        }
    }

    public static <T> T executeWithSharding(String actualTable, java.util.function.Supplier<T> task) {
        try {
            setUseSharding(true);
            setCurrentTableName(actualTable);
            return task.get();
        } finally {
            clear();
        }
    }
}
