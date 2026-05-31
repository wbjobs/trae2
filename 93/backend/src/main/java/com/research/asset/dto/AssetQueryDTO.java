package com.research.asset.dto;

import lombok.Data;
import java.time.LocalDate;

@Data
public class AssetQueryDTO {

    private String keyword;
    private String assetType;
    private String status;
    private String classificationLevel;
    private String department;
    private LocalDate startDate;
    private LocalDate endDate;
    private Integer pageNum;
    private Integer pageSize;
}
