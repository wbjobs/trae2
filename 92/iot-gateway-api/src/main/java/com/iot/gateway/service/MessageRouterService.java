package com.iot.gateway.api.service;

import com.iot.gateway.cache.OfflineMessageCache;
import com.iot.gateway.common.enums.MessageType;
import com.iot.gateway.common.model.CommandRequest;
import com.iot.gateway.common.model.UnifiedMessage;
import com.iot.gateway.persistence.service.DevicePersistenceService;
import com.iot.gateway.protocol.ProtocolAdapter;
import com.iot.gateway.router.ConsistentHashRouter;
import com.iot.gateway.session.DeviceSessionManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
public class MessageRouterService {

    @Autowired
    private DeviceSessionManager sessionManager;

    @Autowired
    private OfflineMessageCache offlineMessageCache;

    @Autowired
    private DevicePersistenceService persistenceService;

    @Autowired
    private ConsistentHashRouter consistentHashRouter;

    @Autowired
    private List<ProtocolAdapter> protocolAdapters;

    private final Map<com.iot.gateway.common.enums.ProtocolType, ProtocolAdapter> adapterMap = new EnumMap<>(com.iot.gateway.common.enums.ProtocolType.class);

    @javax.annotation.PostConstruct
    public void init() {
        for (ProtocolAdapter adapter : protocolAdapters) {
            adapterMap.put(adapter.getProtocolType(), adapter);
        }
    }

    public String sendMessage(UnifiedMessage message) {
        String deviceId = message.getDeviceId();
        boolean isOnline = sessionManager.isOnline(deviceId);

        if (!isOnline) {
            if (message.getQos() > 0) {
                offlineMessageCache.addOfflineMessage(deviceId, message);
            }
            return message.getMessageId();
        }

        com.iot.gateway.common.model.DeviceSession session = sessionManager.getSession(deviceId);
        if (session == null) {
            return null;
        }

        String targetGateway = session.getGatewayInstance();
        String currentInstance = consistentHashRouter.getCurrentInstanceId();

        if (!currentInstance.equals(targetGateway)) {
            log.info("消息路由到目标网关: deviceId={}, target={}", deviceId, targetGateway);
            return message.getMessageId();
        }

        ProtocolAdapter adapter = adapterMap.get(session.getProtocolType());
        if (adapter != null && adapter.isRunning()) {
            adapter.sendMessage(message);
        }

        return message.getMessageId();
    }

    public String sendCommand(CommandRequest request) {
        UnifiedMessage message = UnifiedMessage.builder()
                .messageId(UUID.randomUUID().toString().replace("-", ""))
                .deviceId(request.getDeviceId())
                .messageType(MessageType.COMMAND_REQUEST)
                .payload(new java.util.HashMap<String, Object>() {{
                    put("commandType", request.getCommandType());
                    put("params", request.getParams());
                }})
                .qos(request.getQos())
                .needAck(request.getNeedAck())
                .build();

        return sendMessage(message);
    }

    public void reportData(UnifiedMessage message) {
        persistenceService.saveDeviceData(message);
    }

    public List<UnifiedMessage> getOfflineMessages(String deviceId) {
        return offlineMessageCache.getOfflineMessages(deviceId);
    }

    public void clearOfflineMessages(String deviceId) {
        offlineMessageCache.clearOfflineMessages(deviceId);
    }
}
