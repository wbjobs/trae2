package com.iot.gateway.api.controller;

import com.iot.gateway.common.model.DeviceSession;
import com.iot.gateway.common.model.R;
import com.iot.gateway.event.DeviceOnlineEventListener;
import com.iot.gateway.session.DeviceSessionManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/session")
public class DeviceSessionController {

    @Autowired
    private DeviceSessionManager sessionManager;

    @Autowired
    private DeviceOnlineEventListener eventListener;

    @GetMapping("/{deviceId}")
    public R<DeviceSession> getSession(@PathVariable String deviceId) {
        return R.ok(sessionManager.getSession(deviceId));
    }

    @PostMapping
    public R<Void> saveSession(@RequestBody DeviceSession session) {
        sessionManager.online(session);
        return R.ok();
    }

    @PostMapping("/online")
    public R<Map<String, Object>> online(@RequestBody DeviceSession session) {
        boolean wasOffline = !sessionManager.isOnline(session.getDeviceId());
        boolean result = sessionManager.online(session);

        Map<String, Object> data = new java.util.HashMap<>();
        data.put("success", result);
        data.put("firstOnline", wasOffline);

        if (result && wasOffline) {
            eventListener.publishDeviceOnlineEvent(session.getDeviceId());
            data.put("offlineMessageReissue", true);
        }

        return R.ok(data);
    }

    @PostMapping("/offline/{deviceId}")
    public R<Void> offline(@PathVariable String deviceId) {
        sessionManager.offline(deviceId);
        return R.ok();
    }

    @GetMapping("/list")
    public R<List<DeviceSession>> listOnlineSessions() {
        return R.ok(sessionManager.listOnlineSessions());
    }

    @GetMapping("/online/{deviceId}")
    public R<Boolean> isOnline(@PathVariable String deviceId) {
        return R.ok(sessionManager.isOnline(deviceId));
    }

    @GetMapping("/local")
    public R<List<String>> getLocalDeviceIds() {
        return R.ok(sessionManager.getLocalDeviceIds());
    }

    @PostMapping("/heartbeat/{deviceId}")
    public R<Void> updateHeartbeat(@PathVariable String deviceId) {
        sessionManager.updateHeartbeat(deviceId);
        return R.ok();
    }
}
