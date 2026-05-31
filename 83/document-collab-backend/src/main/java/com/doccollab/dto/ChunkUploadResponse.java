package com.doccollab.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ChunkUploadResponse {
    private String uploadId;
    private Integer chunkIndex;
    private String status;
    private DocumentVersionDTO mergedVersion;
}
