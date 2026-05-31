package com.iot.gateway.codec;

import com.iot.gateway.common.enums.ProtocolType;
import com.iot.gateway.common.model.UnifiedMessage;

public interface MessageCodec {

    ProtocolType getProtocolType();

    byte[] encode(UnifiedMessage message);

    UnifiedMessage decode(byte[] data);
}
