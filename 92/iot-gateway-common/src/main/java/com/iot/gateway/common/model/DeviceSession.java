package com.iot.gateway.common.model;

import com.iot.gateway.common.enums.DeviceStatus;
import com.iot.gateway.common.enums.ProtocolType;
import lombok.Data;

import java.io.Serializable;

@Data
public class DeviceSession implements Serializable {

    private static final long serialVersionUID = 1L;

    private String deviceId;

    private ProtocolType protocolType;

    private DeviceStatus status;

    private String gatewayInstance;

    private String sessionId;

    private String clientIp;

    private Integer clientPort;

    private Long lastHeartbeat;

    private Long onlineTime;

    private Long offlineTime;

    private Map<String, Object> extraInfo;

    public boolean isOnline() {
        return DeviceStatus.ONLINE.equals(this.status);
    }
}
