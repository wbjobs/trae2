package com.iot.gateway.protocol;

import com.iot.gateway.common.enums.ProtocolType;
import com.iot.gateway.common.model.UnifiedMessage;

public interface ProtocolAdapter {

    ProtocolType getProtocolType();

    void start();

    void stop();

    boolean sendMessage(UnifiedMessage message);

    boolean isRunning();
}
