package com.doccollab.dto;

import lombok.Data;

@Data
public class ChunkUploadDTO {
    private String uploadId;
    private String documentId;
    private String fileName;
    private String fileHash;
    private Long fileSize;
    private Integer totalChunks;
    private Integer chunkIndex;
    private Integer chunkSize;
    private byte[] chunkData;
    private String mimeType;
    private String changeLog;
}
