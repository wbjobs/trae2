package com.research.asset.enums;

import lombok.Getter;

@Getter
public enum ApprovalResult {
    APPROVED("通过"),
    REJECTED("驳回"),
    TRANSFERRED("转审"),
    SKIPPED("跳过"),
    AUTO_APPROVED("自动通过");

    private final String description;

    ApprovalResult(String description) {
        this.description = description;
    }
}
