package com.iot.gateway.common.constants;

public interface CacheConstants {

    String DEVICE_SESSION_PREFIX = "iot:device:session:";

    String DEVICE_STATUS_PREFIX = "iot:device:status:";

    String OFFLINE_MESSAGE_PREFIX = "iot:offline:message:";

    String GATEWAY_INSTANCE_PREFIX = "iot:gateway:instance:";

    String CONSISTENT_HASH_RING = "iot:consistent:hash:ring";

    long DEVICE_SESSION_EXPIRE = 300;

    long OFFLINE_MESSAGE_EXPIRE = 86400 * 7;

    int OFFLINE_MESSAGE_MAX_SIZE = 1000;
}
