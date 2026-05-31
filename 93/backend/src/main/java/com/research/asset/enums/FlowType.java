package com.research.asset.enums;

import lombok.Getter;

@Getter
public enum FlowType {
    ARCHIVE("归档审批"),
    BORROW("借阅审批"),
    REVOKE("撤销审批");

    private final String description;

    FlowType(String description) {
        this.description = description;
    }
}
