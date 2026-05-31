package com.iot.gateway.common.feign;

import com.iot.gateway.common.constants.ServiceNameConstants;
import com.iot.gateway.common.model.CommandRequest;
import com.iot.gateway.common.model.R;
import com.iot.gateway.common.model.UnifiedMessage;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.List;

@FeignClient(contextId = "messageFeign", value = ServiceNameConstants.API_SERVICE)
public interface MessageFeign {

    @PostMapping("/message/send")
    R<String> sendMessage(@RequestBody UnifiedMessage message);

    @PostMapping("/message/command")
    R<String> sendCommand(@RequestBody CommandRequest request);

    @PostMapping("/message/report")
    R<Void> reportData(@RequestBody UnifiedMessage message);

    @GetMapping("/message/offline/{deviceId}")
    R<List<UnifiedMessage>> getOfflineMessages(@PathVariable("deviceId") String deviceId);

    @PostMapping("/message/offline/clear/{deviceId}")
    R<Void> clearOfflineMessages(@PathVariable("deviceId") String deviceId);
}
