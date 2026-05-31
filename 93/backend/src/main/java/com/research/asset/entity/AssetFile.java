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
@Table(name = "sys_asset_file")
public class AssetFile {
    @Id
    @GeneratedValue
    @Column(columnDefinition = "BINARY(16)")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "asset_id", nullable = false)
    private Asset asset;

    @Column(nullable = false, length = 255)
    private String fileName;

    @Column(nullable = false)
    private Long fileSize;

    @Column(length = 50)
    private String fileType;

    @Column(nullable = false, length = 255)
    private String ossKey;

    @Column(nullable = false, length = 100)
    private String ossBucket;

    @Column(length = 100)
    private String versionId;

    @Column(nullable = false, columnDefinition = "BINARY(16)")
    private UUID uploadedBy;

    @Column(nullable = false)
    private LocalDateTime uploadedAt;

    @Column(nullable = false)
    private Boolean isTemporary = false;

    private LocalDateTime expiresAt;

    @PrePersist
    protected void onCreate() {
        uploadedAt = LocalDateTime.now();
        if (isTemporary && expiresAt == null) {
            expiresAt = LocalDateTime.now().plusHours(24);
        }
    }
}
