package com.research.asset.enums;

import lombok.Getter;

@Getter
public enum NodeType {
    SINGLE("单人审批"),
    ALL("会签"),
    ANY("或签");

    private final String description;

    NodeType(String description) {
        this.description = description;
    }
}
