package com.research.asset.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class TagDTO {

    private UUID id;
    private String tagName;
    private String tagCode;
    private String tagType;
    private String color;
    private String description;
    private Integer useCount;
    private LocalDateTime createdAt;
}
