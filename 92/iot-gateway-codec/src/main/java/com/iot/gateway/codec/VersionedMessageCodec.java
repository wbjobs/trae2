package com.iot.gateway.codec;

public interface VersionedMessageCodec extends MessageCodec {

    String getVersion();

    default boolean isCompatible(String version) {
        return getVersion().equals(version);
    }
}
