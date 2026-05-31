package com.research.asset.dto;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;

@Data
public class AssetCreateDTO {

    @NotBlank
    private String title;

    @NotBlank
    private String assetType;

    private String abstractText;
    private String keywords;
    private String authors;
    private String department;
    private String projectId;

    @NotBlank
    private String classificationLevel;
}
