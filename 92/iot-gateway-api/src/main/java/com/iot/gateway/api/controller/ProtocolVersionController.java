package com.iot.gateway.api.controller;

import com.iot.gateway.codec.ProtocolVersionManager;
import com.iot.gateway.common.enums.ProtocolType;
import com.iot.gateway.common.model.ProtocolVersion;
import com.iot.gateway.common.model.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/protocol/version")
public class ProtocolVersionController {

    @Autowired(required = false)
    private ProtocolVersionManager versionManager;

    @GetMapping("/list/{protocolType}")
    public R<List<ProtocolVersion>> listVersions(@PathVariable ProtocolType protocolType) {
        if (versionManager == null) {
            return R.error("协议版本管理未启用");
        }
        return R.ok(versionManager.listVersions(protocolType));
    }

    @PostMapping("/switch")
    public R<Boolean> switchVersion(
            @RequestParam ProtocolType protocolType,
            @RequestParam String version) {
        if (versionManager == null) {
            return R.error("协议版本管理未启用");
        }
        boolean success = versionManager.switchVersion(protocolType, version);
        if (success) {
            log.info("协议版本切换成功: {} -> v{}", protocolType, version);
            return R.ok(true);
        }
        return R.error("版本切换失败，版本不存在或未启用");
    }

    @PostMapping("/enable")
    public R<Boolean> enableVersion(
            @RequestParam ProtocolType protocolType,
            @RequestParam String version,
            @RequestParam(defaultValue = "true") boolean enable) {
        if (versionManager == null) {
            return R.error("协议版本管理未启用");
        }
        boolean success = versionManager.enableVersion(protocolType, version, enable);
        return success ? R.ok(true) : R.error("版本启用/禁用失败");
    }

    @GetMapping("/current/{protocolType}")
    public R<String> getCurrentVersion(@PathVariable ProtocolType protocolType) {
        if (versionManager == null) {
            return R.error("协议版本管理未启用");
        }
        String version = versionManager.getCurrentVersion(protocolType);
        return R.ok(version);
    }

    @GetMapping("/support/{protocolType}")
    public R<Boolean> hasVersionSupport(@PathVariable ProtocolType protocolType) {
        if (versionManager == null) {
            return R.ok(false);
        }
        return R.ok(versionManager.listVersions(protocolType).size() > 0);
    }

    @GetMapping("/all")
    public R<Map<String, Object>> getAllVersionInfo() {
        if (versionManager == null) {
            return R.error("协议版本管理未启用");
        }
        Map<String, Object> result = new java.util.HashMap<>();
        for (ProtocolType type : ProtocolType.values()) {
            List<ProtocolVersion> versions = versionManager.listVersions(type);
            if (!versions.isEmpty()) {
                result.put(type.name(), Map.of(
                        "versions", versions,
                        "current", versionManager.getCurrentVersion(type)
                ));
            }
        }
        return R.ok(result);
    }
}
