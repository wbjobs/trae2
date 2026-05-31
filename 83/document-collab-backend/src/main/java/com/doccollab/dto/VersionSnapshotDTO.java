package com.doccollab.dto;

import lombok.Data;

@Data
public class VersionSnapshotDTO {

    private String documentId;

    private String fileName;

    private String filePath;

    private Long fileSize;

    private String mimeType;

    private String snapshotHash;

    private String changeLog;

    private byte[] fileContent;

    private Long expectedVersion;
}
