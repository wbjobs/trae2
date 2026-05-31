package com.iot.gateway.persistence.sharding;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Data
@Configuration
@ConfigurationProperties(prefix = "iot.gateway.sharding")
public class ShardingTableProperties {

    private boolean enabled = false;

    private String strategy = "MONTH";

    private String tablePrefix = "device_data_";

    private List<String> historyTables;

    private boolean autoCreateTable = true;

    private int keepMonths = 12;

    private int hashModulo = 16;

    public enum Strategy {
        DAY, MONTH, YEAR, HASH_DEVICE_ID, HASH_DEVICE_ID_DAY
    }

    public Strategy getStrategyEnum() {
        try {
            return Strategy.valueOf(strategy.toUpperCase());
        } catch (Exception e) {
            return Strategy.MONTH;
        }
    }
}
