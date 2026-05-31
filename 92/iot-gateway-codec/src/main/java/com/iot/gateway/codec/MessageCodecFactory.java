package com.iot.gateway.codec;

import com.iot.gateway.common.enums.ProtocolType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class MessageCodecFactory {

    @Autowired
    private List<MessageCodec> codecList;

    @Autowired(required = false)
    private ProtocolVersionManager versionManager;

    private final Map<ProtocolType, MessageCodec> codecMap = new EnumMap<>(ProtocolType.class);

    @PostConstruct
    public void init() {
        for (MessageCodec codec : codecList) {
            if (!(codec instanceof VersionedMessageCodec)) {
                codecMap.put(codec.getProtocolType(), codec);
            }
        }
        log.info("消息编解码工厂初始化完成, 注册编解码器: {}", codecMap.keySet());
    }

    public MessageCodec getCodec(ProtocolType protocolType) {
        return getCodec(protocolType, null);
    }

    public MessageCodec getCodec(ProtocolType protocolType, String version) {
        if (versionManager != null) {
            MessageCodec codec = versionManager.getCodec(protocolType, version);
            if (codec != null) {
                return codec;
            }
        }
        MessageCodec codec = codecMap.get(protocolType);
        if (codec == null) {
            log.warn("未找到编解码器: protocol={}, version={}", protocolType, version);
        }
        return codec;
    }

    public byte[] encode(ProtocolType protocolType, Object message) {
        return encode(protocolType, null, message);
    }

    public byte[] encode(ProtocolType protocolType, String version, Object message) {
        MessageCodec codec = getCodec(protocolType, version);
        if (codec == null) {
            throw new IllegalArgumentException("不支持的协议类型: " + protocolType +
                    (version != null ? ", 版本: " + version : ""));
        }
        byte[] result = codec.encode((com.iot.gateway.common.model.UnifiedMessage) message);
        if (result == null || result.length == 0) {
            log.warn("协议编码结果为空: protocol={}, version={}", protocolType, version);
        }
        return result;
    }

    public com.iot.gateway.common.model.UnifiedMessage decode(ProtocolType protocolType, byte[] data) {
        return decode(protocolType, null, data);
    }

    public com.iot.gateway.common.model.UnifiedMessage decode(ProtocolType protocolType, String version, byte[] data) {
        if (data == null || data.length == 0) {
            log.warn("解码数据为空: protocol={}", protocolType);
            return null;
        }
        MessageCodec codec = getCodec(protocolType, version);
        if (codec == null) {
            throw new IllegalArgumentException("不支持的协议类型: " + protocolType +
                    (version != null ? ", 版本: " + version : ""));
        }
        return codec.decode(data);
    }

    public boolean hasVersionSupport(ProtocolType protocolType) {
        return versionManager != null && versionManager.listVersions(protocolType).size() > 0;
    }

    public String getCurrentVersion(ProtocolType protocolType) {
        if (versionManager != null) {
            return versionManager.getCurrentVersion(protocolType);
        }
        return null;
    }
}
