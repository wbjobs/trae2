package com.research.asset.enums;

import lombok.Getter;

@Getter
public enum InstanceStatus {
    PENDING("审批中"),
    APPROVED("已通过"),
    REJECTED("已驳回"),
    CANCELLED("已取消");

    private final String description;

    InstanceStatus(String description) {
        this.description = description;
    }
}
