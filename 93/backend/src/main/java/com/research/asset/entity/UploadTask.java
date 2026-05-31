package com.research.asset.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "sys_upload_task")
public class UploadTask {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "BINARY(16)")
    private UUID id;

    @Column(nullable = false, length = 64, unique = true)
    private String uploadId;

    @Column(nullable = false, length = 255)
    private String fileName;

    @Column(nullable = false)
    private Long fileSize;

    @Column(length = 50)
    private String fileType;

    @Column(length = 100)
    private String mimeType;

    @Column(nullable = false)
    private Integer chunkSize = 5242880;

    @Column(nullable = false)
    private Integer totalChunks;

    @Column(nullable = false)
    private Integer uploadedChunks = 0;

    @Column(nullable = false)
    private Long uploadedSize = 0L;

    @Column(length = 512)
    private String ossKey;

    @Column(nullable = false, columnDefinition = "BINARY(16)")
    private UUID userId;

    @Column(nullable = false, length = 20)
    private String status = "INIT";

    @Column(nullable = false)
    private LocalDateTime createdAt;

    private LocalDateTime completedAt;

    @Column(nullable = false)
    private LocalDateTime expiredAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (expiredAt == null) {
            expiredAt = LocalDateTime.now().plusHours(24);
        }
    }
}
