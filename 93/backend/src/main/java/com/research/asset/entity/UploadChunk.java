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
@Table(name = "sys_upload_chunk", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"upload_id", "chunk_number"})
})
public class UploadChunk {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "BINARY(16)")
    private UUID id;

    @Column(nullable = false, length = 64)
    private String uploadId;

    @Column(nullable = false)
    private Integer chunkNumber;

    @Column(nullable = false)
    private Integer chunkSize;

    @Column(nullable = false, length = 512)
    private String ossKey;

    @Column(length = 32)
    private String md5;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
