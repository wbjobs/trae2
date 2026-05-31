package com.doccollab.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class DocumentVersionDTO {

    private String id;

    private String documentId;

    private String tenantId;

    private Integer versionNumber;

    private Integer baseVersionNumber;

    private String fileName;

    private String filePath;

    private Long fileSize;

    private String mimeType;

    private String snapshotHash;

    private String changeLog;

    private String createdBy;

    private LocalDateTime createdAt;

    private Boolean isLatest;
}
