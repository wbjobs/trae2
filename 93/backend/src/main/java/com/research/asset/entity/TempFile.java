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
@Table(name = "sys_temp_file")
public class TempFile {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "BINARY(16)")
    private UUID id;

    @Column(nullable = false, length = 255)
    private String ossKey;

    @Column(nullable = false, length = 100)
    private String ossBucket;

    @Column(nullable = false, length = 255)
    private String originalFileName;

    @Column(nullable = false)
    private Long fileSize;

    @Column(length = 50)
    private String fileType;

    @Column(columnDefinition = "BINARY(16)")
    private UUID uploadedBy;

    @Column(nullable = false)
    private String uploadSession;

    @Column(nullable = false)
    private LocalDateTime uploadedAt;

    @Column(nullable = false)
    private LocalDateTime expiresAt;

    @Column(nullable = false)
    private Boolean isAttached = false;

    @PrePersist
    protected void onCreate() {
        uploadedAt = LocalDateTime.now();
        if (expiresAt == null) {
            expiresAt = LocalDateTime.now().plusHours(24);
        }
    }
}
