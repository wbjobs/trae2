package com.research.asset.enums;

import lombok.Getter;

@Getter
public enum AssetType {
    PAPER("科研论文"),
    REPORT("实验报告"),
    PATENT("专利材料"),
    DATA("科研数据"),
    OTHER("其他");

    private final String description;

    AssetType(String description) {
        this.description = description;
    }
}
