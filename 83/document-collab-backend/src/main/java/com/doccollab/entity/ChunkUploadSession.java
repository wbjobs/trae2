package com.doccollab.entity;

import lombok.Data;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@Document(collection = "chunk_upload_sessions")
public class ChunkUploadSession {

    @Id
    private String id;

    @Indexed(unique = true)
    private String uploadId;

    @Indexed
    private String tenantId;

    private String documentId;

    private String fileName;

    private String fileHash;

    private Long fileSize;

    private Integer totalChunks;

    private Integer chunkSize;

    private String mimeType;

    private String changeLog;

    private String createdBy;

    private List<Integer> uploadedChunks = new ArrayList<>();

    private String status;

    @CreatedDate
    @Indexed
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    private String filePath;
}
