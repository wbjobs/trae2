package com.iot.gateway.api.controller;

import com.iot.gateway.common.model.BatchDeviceDataRequest;
import com.iot.gateway.common.model.BatchResult;
import com.iot.gateway.common.model.R;
import com.iot.gateway.common.model.UnifiedMessage;
import com.iot.gateway.persistence.service.DevicePersistenceService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/data/batch")
public class BatchDataController {

    @Autowired
    private DevicePersistenceService persistenceService;

    @PostMapping("/report")
    public R<BatchResult> batchReport(
            @RequestBody @Validated BatchDeviceDataRequest request) {
        long startTime = System.currentTimeMillis();
        log.info("接收批量上报数据, 条数: {}, 异步: {}", request.getDataList().size(), request.getAsync());

        if (request.getDataList().size() > 1000) {
            return R.error("单次批量上报不能超过1000条");
        }

        BatchResult result;
        if (Boolean.FALSE.equals(request.getAsync())) {
            result = persistenceService.saveBatchDeviceDataDirect(request);
        } else {
            List<UnifiedMessage> messages = new java.util.ArrayList<>();
            for (BatchDeviceDataRequest.DeviceDataItem item : request.getDataList()) {
                UnifiedMessage msg = new UnifiedMessage();
                msg.setDeviceId(item.getDeviceId());
                msg.setMessageId(item.getMessageId());
                msg.setMessageType(com.iot.gateway.common.enums.MessageType.getByCode(item.getMessageType()));
                msg.setPayload(item.getPayload());
                msg.setTimestamp(item.getTimestamp());
                msg.setQos(item.getQos());
                msg.setNeedAck(item.getNeedAck());
                msg.setGatewayInstance(request.getGatewayInstance());
                messages.add(msg);
            }
            result = persistenceService.saveBatchDeviceData(messages);
        }

        result.setCostTime(System.currentTimeMillis() - startTime);
        log.info("批量上报完成, 总数: {}, 成功: {}, 失败: {}, 耗时: {}ms",
                result.getTotal(), result.getSuccess(), result.getFailed(), result.getCostTime());

        return R.ok(result);
    }

    @PostMapping("/flush")
    public R<Map<String, Object>> flushQueue() {
        int queueSize = persistenceService.getQueueSize();
        persistenceService.flushWriteQueue();
        Map<String, Object> result = new java.util.HashMap<>();
        result.put("beforeFlush", queueSize);
        result.put("afterFlush", persistenceService.getQueueSize());
        result.put("message", "已触发异步刷盘");
        return R.ok(result);
    }

    @GetMapping("/queue/size")
    public R<Integer> getQueueSize() {
        return R.ok(persistenceService.getQueueSize());
    }
}
