package com.research.asset.enums;

import lombok.Getter;

@Getter
public enum AssetStatus {
    DRAFT("草稿"),
    ARCHIVED("已归档"),
    APPROVING("审批中"),
    BORROWED("借阅中"),
    REVOKED("已撤销");

    private final String description;

    AssetStatus(String description) {
        this.description = description;
    }
}
