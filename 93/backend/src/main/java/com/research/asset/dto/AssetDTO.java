package com.research.asset.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
public class AssetDTO {

    private UUID id;
    private String assetCode;
    private String title;
    private String assetType;
    private String abstractText;
    private String keywords;
    private String authors;
    private String department;
    private String projectId;
    private String status;
    private String classificationLevel;
    private UUID createdBy;
    private String createdByName;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<AssetFileDTO> files;
}
