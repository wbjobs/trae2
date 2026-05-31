package com.iot.gateway.common.feign;

import com.iot.gateway.common.constants.ServiceNameConstants;
import com.iot.gateway.common.model.DeviceSession;
import com.iot.gateway.common.model.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.List;

@FeignClient(contextId = "deviceSessionFeign", value = ServiceNameConstants.API_SERVICE)
public interface DeviceSessionFeign {

    @GetMapping("/session/{deviceId}")
    R<DeviceSession> getSession(@PathVariable("deviceId") String deviceId);

    @PostMapping("/session")
    R<Void> saveSession(@RequestBody DeviceSession session);

    @PostMapping("/session/online")
    R<Void> online(@RequestBody DeviceSession session);

    @PostMapping("/session/offline/{deviceId}")
    R<Void> offline(@PathVariable("deviceId") String deviceId);

    @GetMapping("/session/list")
    R<List<DeviceSession>> listOnlineSessions();

    @GetMapping("/session/online/{deviceId}")
    R<Boolean> isOnline(@PathVariable("deviceId") String deviceId);
}
