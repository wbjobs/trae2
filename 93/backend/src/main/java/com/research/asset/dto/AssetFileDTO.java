package com.research.asset.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class AssetFileDTO {

    private UUID id;
    private String fileName;
    private Long fileSize;
    private String fileType;
    private String ossKey;
    private String downloadUrl;
    private String uploadedByName;
    private LocalDateTime uploadedAt;
}
