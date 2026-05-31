package com.iot.gateway.protocol;

import com.iot.gateway.common.model.DeviceSession;
import com.iot.gateway.session.DeviceSessionManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import javax.annotation.PreDestroy;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Component
public class ProtocolAdapterManager {

    @Autowired
    private List<ProtocolAdapter> protocolAdapters;

    @Autowired
    private DeviceSessionManager sessionManager;

    private final Map<com.iot.gateway.common.enums.ProtocolType, ProtocolAdapter> adapterMap = new EnumMap<>(com.iot.gateway.common.enums.ProtocolType.class);

    private final AtomicBoolean initialized = new AtomicBoolean(false);

    @javax.annotation.PostConstruct
    public void init() {
        for (ProtocolAdapter adapter : protocolAdapters) {
            adapterMap.put(adapter.getProtocolType(), adapter);
        }
        log.info("协议适配器管理器初始化完成, 已注册协议适配器数量: {}", adapterMap.size());
    }

    @EventListener(ApplicationReadyEvent.class)
    public void startAll() {
        if (initialized.compareAndSet(false, true)) {
            for (ProtocolAdapter adapter : protocolAdapters) {
                try {
                    if (!adapter.isRunning()) {
                        adapter.start();
                        log.info("协议适配器已启动: {}", adapter.getProtocolType());
                    }
                } catch (Exception e) {
                    log.error("协议适配器启动失败: {}", adapter.getProtocolType(), e);
                }
            }
        }
    }

    @PreDestroy
    public void stopAll() {
        for (ProtocolAdapter adapter : protocolAdapters) {
            try {
                if (adapter.isRunning()) {
                    adapter.stop();
                    log.info("协议适配器已停止: {}", adapter.getProtocolType());
                }
            } catch (Exception e) {
                log.error("协议适配器停止失败: {}", adapter.getProtocolType(), e);
            }
        }
    }

    public boolean reportSession(DeviceSession session) {
        if (session == null || session.getDeviceId() == null) {
            log.warn("上报会话: 参数为空");
            return false;
        }

        try {
            boolean result = sessionManager.online(session);
            if (result) {
                log.debug("会话上报成功: deviceId={}, protocol={}",
                        session.getDeviceId(), session.getProtocolType());
            }
            return result;
        } catch (Exception e) {
            log.error("会话上报失败: deviceId={}", session.getDeviceId(), e);
            return false;
        }
    }

    public boolean reportOffline(String deviceId) {
        if (deviceId == null) {
            log.warn("上报离线: deviceId为空");
            return false;
        }

        try {
            boolean result = sessionManager.offline(deviceId);
            if (result) {
                log.debug("离线上报成功: deviceId={}", deviceId);
            }
            return result;
        } catch (Exception e) {
            log.error("离线上报失败: deviceId={}", deviceId, e);
            return false;
        }
    }

    public boolean sendMessage(com.iot.gateway.common.model.UnifiedMessage message) {
        if (message == null || message.getDeviceId() == null) {
            return false;
        }

        com.iot.gateway.common.model.DeviceSession session = sessionManager.getSession(message.getDeviceId());
        if (session == null) {
            log.warn("发送消息: 设备会话不存在, deviceId={}", message.getDeviceId());
            return false;
        }

        ProtocolAdapter adapter = adapterMap.get(session.getProtocolType());
        if (adapter == null) {
            log.warn("发送消息: 未找到协议适配器, protocol={}", session.getProtocolType());
            return false;
        }

        if (!adapter.isRunning()) {
            log.warn("发送消息: 协议适配器未运行, protocol={}", session.getProtocolType());
            return false;
        }

        return adapter.sendMessage(message);
    }

    public ProtocolAdapter getAdapter(com.iot.gateway.common.enums.ProtocolType protocolType) {
        return adapterMap.get(protocolType);
    }

    public List<ProtocolAdapter> getAllAdapters() {
        return protocolAdapters;
    }

    public boolean isProtocolRunning(com.iot.gateway.common.enums.ProtocolType protocolType) {
        ProtocolAdapter adapter = adapterMap.get(protocolType);
        return adapter != null && adapter.isRunning();
    }
}
