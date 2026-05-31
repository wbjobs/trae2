package com.research.asset.enums;

import lombok.Getter;

@Getter
public enum ClassificationLevel {
    PUBLIC("公开"),
    INTERNAL("内部"),
    CONFIDENTIAL("机密"),
    SECRET("绝密");

    private final String description;

    ClassificationLevel(String description) {
        this.description = description;
    }
}
