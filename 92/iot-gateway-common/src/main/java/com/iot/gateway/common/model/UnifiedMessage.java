package com.iot.gateway.common.model;

import com.iot.gateway.common.enums.MessageType;
import com.iot.gateway.common.enums.ProtocolType;
import lombok.Data;

import java.io.Serializable;
import java.util.Map;

@Data
public class UnifiedMessage implements Serializable {

    private static final long serialVersionUID = 1L;

    private String messageId;

    private String deviceId;

    private ProtocolType protocolType;

    private MessageType messageType;

    private Long timestamp;

    private Map<String, Object> payload;

    private String gatewayInstance;

    private Integer qos = 0;

    private Boolean needAck = false;

    public UnifiedMessage() {
        this.timestamp = System.currentTimeMillis();
    }

    public static UnifiedMessageBuilder builder() {
        return new UnifiedMessageBuilder();
    }

    public static class UnifiedMessageBuilder {
        private final UnifiedMessage message;

        public UnifiedMessageBuilder() {
            this.message = new UnifiedMessage();
        }

        public UnifiedMessageBuilder messageId(String messageId) {
            message.setMessageId(messageId);
            return this;
        }

        public UnifiedMessageBuilder deviceId(String deviceId) {
            message.setDeviceId(deviceId);
            return this;
        }

        public UnifiedMessageBuilder protocolType(ProtocolType protocolType) {
            message.setProtocolType(protocolType);
            return this;
        }

        public UnifiedMessageBuilder messageType(MessageType messageType) {
            message.setMessageType(messageType);
            return this;
        }

        public UnifiedMessageBuilder payload(Map<String, Object> payload) {
            message.setPayload(payload);
            return this;
        }

        public UnifiedMessageBuilder gatewayInstance(String gatewayInstance) {
            message.setGatewayInstance(gatewayInstance);
            return this;
        }

        public UnifiedMessage build() {
            return message;
        }
    }
}
