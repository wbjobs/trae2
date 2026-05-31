package com.iot.gateway.persistence.service;

import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.iot.gateway.common.model.BatchDeviceDataRequest;
import com.iot.gateway.common.model.BatchResult;
import com.iot.gateway.common.model.UnifiedMessage;
import com.iot.gateway.persistence.entity.CommandLog;
import com.iot.gateway.persistence.entity.DeviceData;
import com.iot.gateway.persistence.mapper.CommandLogMapper;
import com.iot.gateway.persistence.mapper.DeviceDataMapper;
import com.iot.gateway.persistence.mapper.DeviceInfoMapper;
import com.iot.gateway.persistence.sharding.DynamicTableNameHandler;
import com.iot.gateway.persistence.sharding.ShardingTableManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class DevicePersistenceService {

    private static final int BATCH_SIZE = 100;
    private static final long FLUSH_INTERVAL_MS = 3000;
    private static final int MAX_QUEUE_SIZE = 100000;

    private final BlockingQueue<DeviceData> writeQueue = new LinkedBlockingQueue<>(MAX_QUEUE_SIZE);

    @Autowired
    private DeviceDataMapper deviceDataMapper;

    @Autowired
    private DeviceInfoMapper deviceInfoMapper;

    @Autowired
    private CommandLogMapper commandLogMapper;

    @Autowired(required = false)
    private ShardingTableManager shardingTableManager;

    @Async
    public void saveDeviceData(UnifiedMessage message) {
        if (message == null) {
            return;
        }
        try {
            DeviceData data = buildDeviceData(message);
            if (!writeQueue.offer(data, 100, TimeUnit.MILLISECONDS)) {
                log.warn("写入队列已满, 直接单条写入: deviceId={}", message.getDeviceId());
                doInsert(data);
            }
        } catch (Exception e) {
            log.error("保存设备数据失败", e);
        }
    }

    public BatchResult saveBatchDeviceData(List<UnifiedMessage> messages) {
        BatchResult result = new BatchResult();
        result.setTotal(messages.size());
        long startTime = System.currentTimeMillis();

        for (int i = 0; i < messages.size(); i++) {
            UnifiedMessage message = messages.get(i);
            try {
                DeviceData data = buildDeviceData(message);
                if (writeQueue.offer(data, 50, TimeUnit.MILLISECONDS)) {
                    result.setSuccess(result.getSuccess() + 1);
                } else {
                    doInsert(data);
                    result.setSuccess(result.getSuccess() + 1);
                }
            } catch (Exception e) {
                result.setFailed(result.getFailed() + 1);
                result.getFailedItems().add(new BatchResult.FailedItem(
                        i, message != null ? message.getDeviceId() : "null", e.getMessage()));
                log.error("批量保存失败, index={}", i, e);
            }
        }

        result.setCostTime(System.currentTimeMillis() - startTime);
        return result;
    }

    public BatchResult saveBatchDeviceDataDirect(BatchDeviceDataRequest request) {
        BatchResult result = new BatchResult();
        long startTime = System.currentTimeMillis();
        List<BatchDeviceDataRequest.DeviceDataItem> dataList = request.getDataList();
        result.setTotal(dataList.size());

        Map<String, List<DeviceData>> tableGroup = new HashMap<>();

        for (int i = 0; i < dataList.size(); i++) {
            BatchDeviceDataRequest.DeviceDataItem item = dataList.get(i);
            try {
                DeviceData data = new DeviceData();
                data.setDeviceId(item.getDeviceId());
                data.setMessageType(item.getMessageType());
                data.setPayload(item.getPayload() != null ? JSON.toJSONString(item.getPayload()) : "{}");
                data.setMessageId(item.getMessageId());
                data.setGatewayInstance(request.getGatewayInstance());
                data.setCreateTime(item.getTimestamp() != null ?
                        LocalDateTime.now() : LocalDateTime.now());

                String tableName = getTargetTable(data.getDeviceId(), data.getCreateTime());
                tableGroup.computeIfAbsent(tableName, k -> new ArrayList<>()).add(data);
            } catch (Exception e) {
                result.setFailed(result.getFailed() + 1);
                result.getFailedItems().add(new BatchResult.FailedItem(
                        i, item.getDeviceId(), e.getMessage()));
                log.error("批量数据处理失败, index={}", i, e);
            }
        }

        for (Map.Entry<String, List<DeviceData>> entry : tableGroup.entrySet()) {
            String tableName = entry.getKey();
            List<DeviceData> dataBatch = entry.getValue();
            try {
                if (shardingTableManager != null && shardingTableManager.isShardingEnabled()) {
                    shardingTableManager.ensureTableExists(tableName);
                    DynamicTableNameHandler.executeWithSharding(tableName, () -> {
                        doBatchInsert(dataBatch);
                        return null;
                    });
                } else {
                    doBatchInsert(dataBatch);
                }
                result.setSuccess(result.getSuccess() + dataBatch.size());
            } catch (Exception e) {
                result.setFailed(result.getFailed() + dataBatch.size());
                for (int j = 0; j < dataBatch.size(); j++) {
                    result.getFailedItems().add(new BatchResult.FailedItem(
                            -1, dataBatch.get(j).getDeviceId(),
                            "批量写入失败: " + e.getMessage()));
                }
                log.error("批量写入表{}失败, 条数={}", tableName, dataBatch.size(), e);
            }
        }

        result.setCostTime(System.currentTimeMillis() - startTime);
        return result;
    }

    @Async
    public void flushWriteQueue() {
        if (writeQueue.isEmpty()) {
            return;
        }
        int flushed = 0;
        long startTime = System.currentTimeMillis();
        try {
            while (!writeQueue.isEmpty()) {
                List<DeviceData> batch = new ArrayList<>(BATCH_SIZE);
                writeQueue.drainTo(batch, BATCH_SIZE);

                if (batch.isEmpty()) {
                    break;
                }

                if (shardingTableManager != null && shardingTableManager.isShardingEnabled()) {
                    Map<String, List<DeviceData>> grouped = new HashMap<>();
                    for (DeviceData data : batch) {
                        String tableName = getTargetTable(data.getDeviceId(), data.getCreateTime());
                        grouped.computeIfAbsent(tableName, k -> new ArrayList<>()).add(data);
                    }
                    for (Map.Entry<String, List<DeviceData>> entry : grouped.entrySet()) {
                        try {
                            shardingTableManager.ensureTableExists(entry.getKey());
                            DynamicTableNameHandler.executeWithSharding(entry.getKey(), () -> {
                                doBatchInsert(entry.getValue());
                                return null;
                            });
                            flushed += entry.getValue().size();
                        } catch (Exception e) {
                            log.error("分表写入失败: {}", entry.getKey(), e);
                            for (DeviceData data : entry.getValue()) {
                                try {
                                    DynamicTableNameHandler.executeWithSharding(entry.getKey(), () -> {
                                        doInsert(data);
                                        return null;
                                    });
                                    flushed++;
                                } catch (Exception ex) {
                                    log.error("单条重试写入失败: deviceId={}", data.getDeviceId(), ex);
                                }
                            }
                        }
                    }
                } else {
                    doBatchInsert(batch);
                    flushed += batch.size();
                }

                if (System.currentTimeMillis() - startTime > 30000) {
                    log.warn("刷写队列超时, 已刷新{}条, 剩余{}条", flushed, writeQueue.size());
                    break;
                }
            }
        } catch (Exception e) {
            log.error("刷新写入队列失败", e);
        } finally {
            if (flushed > 0) {
                log.info("刷新写入队列完成, 共{}条, 耗时{}ms", flushed, System.currentTimeMillis() - startTime);
            }
        }
    }

    private void doInsert(DeviceData data) {
        try {
            if (shardingTableManager != null && shardingTableManager.isShardingEnabled()) {
                String tableName = getTargetTable(data.getDeviceId(), data.getCreateTime());
                shardingTableManager.ensureTableExists(tableName);
                DynamicTableNameHandler.executeWithSharding(tableName, () -> {
                    deviceDataMapper.insert(data);
                    return null;
                });
            } else {
                deviceDataMapper.insert(data);
            }
        } catch (Exception e) {
            log.error("单条插入失败: deviceId={}", data.getDeviceId(), e);
        }
    }

    private void doBatchInsert(List<DeviceData> dataList) {
        if (dataList == null || dataList.isEmpty()) {
            return;
        }
        if (dataList.size() == 1) {
            deviceDataMapper.insert(dataList.get(0));
            return;
        }
        deviceDataMapper.insertBatch(dataList);
    }

    private DeviceData buildDeviceData(UnifiedMessage message) {
        DeviceData data = new DeviceData();
        data.setDeviceId(message.getDeviceId());
        data.setMessageId(message.getMessageId());
        data.setMessageType(message.getMessageType() != null ? message.getMessageType().getCode() : 0);
        data.setPayload(message.getPayload() != null ? JSON.toJSONString(message.getPayload()) : "{}");
        data.setGatewayInstance(message.getGatewayInstance());
        data.setCreateTime(LocalDateTime.now());
        return data;
    }

    private String getTargetTable(String deviceId, LocalDateTime timestamp) {
        if (shardingTableManager != null) {
            return shardingTableManager.getActualTableName(deviceId, timestamp);
        }
        return "device_data";
    }

    @Async
    public void saveCommandLog(CommandLog log) {
        try {
            log.setCreateTime(LocalDateTime.now());
            commandLogMapper.insert(log);
        } catch (Exception e) {
            DevicePersistenceService.log.error("保存命令日志失败", e);
        }
    }

    public long getDeviceDataCount(String deviceId) {
        return deviceDataMapper.selectCount(new LambdaQueryWrapper<DeviceData>()
                .eq(DeviceData::getDeviceId, deviceId));
    }

    public int getQueueSize() {
        return writeQueue.size();
    }
}
