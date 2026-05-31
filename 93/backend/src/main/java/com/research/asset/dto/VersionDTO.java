package com.research.asset.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class VersionDTO {

    private UUID id;
    private UUID assetId;
    private Integer versionNumber;
    private String versionTag;
    private String changeDescription;
    private String createdByName;
    private LocalDateTime createdAt;
}
