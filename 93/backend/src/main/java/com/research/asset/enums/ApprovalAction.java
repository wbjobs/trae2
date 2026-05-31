package com.research.asset.enums;

import lombok.Getter;

@Getter
public enum ApprovalAction {
    APPROVE("通过"),
    REJECT("驳回"),
    TRANSFER("转审");

    private final String description;

    ApprovalAction(String description) {
        this.description = description;
    }
}
