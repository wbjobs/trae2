package com.doccollab.service;

import com.doccollab.dto.ChunkUploadDTO;
import com.doccollab.dto.ChunkUploadResponse;

public interface ChunkUploadService {
    ChunkUploadResponse uploadChunk(String tenantId, String userId, ChunkUploadDTO chunkDTO);

    ChunkUploadResponse checkChunk(String tenantId, String uploadId, Integer chunkIndex);

    ChunkUploadResponse mergeChunks(String tenantId, String userId, String uploadId);

    ChunkUploadResponse cancelUpload(String tenantId, String uploadId);
}
