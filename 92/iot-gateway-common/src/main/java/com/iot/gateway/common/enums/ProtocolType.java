package com.iot.gateway.common.enums;

import lombok.Getter;

@Getter
public enum ProtocolType {

    MODBUS_RTU(1, "Modbus RTU"),
    MODBUS_TCP(2, "Modbus TCP"),
    LORA(3, "LoRa"),
    MQTT(4, "MQTT"),
    CUSTOM(5, "自定义私有协议");

    private final int code;
    private final String desc;

    ProtocolType(int code, String desc) {
        this.code = code;
        this.desc = desc;
    }

    public static ProtocolType getByCode(int code) {
        for (ProtocolType type : values()) {
            if (type.getCode() == code) {
                return type;
            }
        }
        return null;
    }
}
