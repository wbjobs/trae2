package com.research.asset.dto;

import lombok.Data;
import java.util.List;
import java.util.UUID;

@Data
public class TagAutoClassifyDTO {

    private UUID assetId;
    private String assetTitle;
    private List<TagDTO> matchedTags;
    private List<String> matchedKeywords;
    private String classifyReason;
}
