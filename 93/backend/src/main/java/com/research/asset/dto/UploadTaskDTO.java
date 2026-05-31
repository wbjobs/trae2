package com.research.asset.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class UploadTaskDTO {

    private String uploadId;
    private String fileName;
    private Long fileSize;
    private String fileType;
    private Integer chunkSize;
    private Integer totalChunks;
    private Integer uploadedChunks;
    private Long uploadedSize;
    private String status;
    private String ossKey;
    private LocalDateTime createdAt;
    private LocalDateTime completedAt;
    private List<Integer> uploadedChunkNumbers;
}
