package com.research.asset.dto;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

@Data
public class VersionCreateDTO {

    @NotNull
    private UUID assetId;

    @NotBlank
    private String versionTag;

    @NotBlank
    private String changeDescription;
}
