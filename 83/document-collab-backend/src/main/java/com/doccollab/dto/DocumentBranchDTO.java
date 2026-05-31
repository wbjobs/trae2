package com.doccollab.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class DocumentBranchDTO {
    private String id;
    private String documentId;
    private String tenantId;
    private String name;
    private String description;
    private String baseVersionId;
    private Integer baseVersionNumber;
    private String currentVersionId;
    private Integer currentVersionNumber;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private String status;
    private Boolean isDefault;
    private Integer versionCount;
}
