package com.research.asset.enums;

import lombok.Getter;

@Getter
public enum CirculationStatus {
    PENDING("待审批"),
    APPROVED("已通过"),
    ACTIVE("借阅中"),
    RETURNED("已归还"),
    OVERDUE("已逾期");

    private final String description;

    CirculationStatus(String description) {
        this.description = description;
    }
}
