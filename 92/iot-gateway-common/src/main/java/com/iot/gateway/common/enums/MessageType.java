package com.iot.gateway.common.enums;

import lombok.Getter;

@Getter
public enum MessageType {

    HEARTBEAT(1, "心跳"),
    LOGIN(2, "登录"),
    LOGOUT(3, "登出"),
    DATA_REPORT(4, "数据上报"),
    COMMAND_REQUEST(5, "命令请求"),
    COMMAND_RESPONSE(6, "命令响应"),
    OFFLINE_MESSAGE(7, "离线消息");

    private final int code;
    private final String desc;

    MessageType(int code, String desc) {
        this.code = code;
        this.desc = desc;
    }

    public static MessageType getByCode(int code) {
        for (MessageType type : values()) {
            if (type.getCode() == code) {
                return type;
            }
        }
        return null;
    }
}
