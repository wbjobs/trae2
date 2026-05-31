package com.research.asset.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class TagClassifyDTO {

    private UUID assetId;
    private java.util.List<UUID> tagIds;
}
