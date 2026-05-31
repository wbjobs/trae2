package com.doccollab.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class DocumentDTO {

    private String id;

    private String tenantId;

    private String name;

    private String description;

    private String currentVersionId;

    private Integer currentVersionNumber;

    private Long version;

    private String createdBy;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
