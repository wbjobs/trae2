package com.iot.gateway.api.controller;

import com.iot.gateway.api.service.MessageRouterService;
import com.iot.gateway.cache.OfflineMessageCache;
import com.iot.gateway.common.model.CommandRequest;
import com.iot.gateway.common.model.R;
import com.iot.gateway.common.model.UnifiedMessage;
import com.iot.gateway.event.DeviceOnlineEventListener;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/message")
public class MessageController {

    @Autowired
    private MessageRouterService messageRouterService;

    @Autowired
    private OfflineMessageCache offlineMessageCache;

    @Autowired
    private DeviceOnlineEventListener eventListener;

    @PostMapping("/send")
    public R<String> sendMessage(@RequestBody UnifiedMessage message) {
        return R.ok(messageRouterService.sendMessage(message));
    }

    @PostMapping("/command")
    public R<String> sendCommand(@Validated @RequestBody CommandRequest request) {
        return R.ok(messageRouterService.sendCommand(request));
    }

    @PostMapping("/report")
    public R<Void> reportData(@RequestBody UnifiedMessage message) {
        messageRouterService.reportData(message);
        return R.ok();
    }

    @GetMapping("/offline/{deviceId}")
    public R<List<UnifiedMessage>> getOfflineMessages(@PathVariable String deviceId) {
        return R.ok(messageRouterService.getOfflineMessages(deviceId));
    }

    @PostMapping("/offline/clear/{deviceId}")
    public R<Void> clearOfflineMessages(@PathVariable String deviceId) {
        messageRouterService.clearOfflineMessages(deviceId);
        return R.ok();
    }

    @PostMapping("/offline/confirm")
    public R<Boolean> confirmMessage(@RequestBody ConfirmRequest request) {
        boolean result = offlineMessageCache.confirmMessage(
                request.getDeviceId(),
                request.getMessageId(),
                request.isSuccess(),
                request.getErrorMsg()
        );
        return R.ok(result);
    }

    @PostMapping("/offline/reissue/{deviceId}")
    public R<Map<String, Integer>> reissueOfflineMessages(@PathVariable String deviceId) {
        eventListener.publishDeviceOnlineEvent(deviceId);
        Map<String, Integer> result = new java.util.HashMap<>();
        result.put("pendingCount", offlineMessageCache.getOfflineMessageCount(deviceId));
        return R.ok(result);
    }

    @GetMapping("/offline/count/{deviceId}")
    public R<Integer> getOfflineMessageCount(@PathVariable String deviceId) {
        return R.ok(offlineMessageCache.getOfflineMessageCount(deviceId));
    }

    @GetMapping("/status/{messageId}")
    public R<Map<String, Integer>> getMessageStatus(@PathVariable String messageId) {
        return R.ok(offlineMessageCache.getMessageStatus(messageId));
    }

    @Data
    public static class ConfirmRequest {
        private String deviceId;
        private String messageId;
        private boolean success;
        private String errorMsg;
    }
}
