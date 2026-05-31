package com.iot.gateway.common.enums;

import lombok.Getter;

@Getter
public enum DeviceStatus {

    ONLINE(1, "在线"),
    OFFLINE(0, "离线");

    private final int code;
    private final String desc;

    DeviceStatus(int code, String desc) {
        this.code = code;
        this.desc = desc;
    }

    public static DeviceStatus getByCode(int code) {
        for (DeviceStatus status : values()) {
            if (status.getCode() == code) {
                return status;
            }
        }
        return null;
    }
}
