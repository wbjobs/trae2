package com.research.asset.dto;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

@Data
public class ApprovalSubmitDTO {

    @NotNull
    private UUID assetId;

    @NotBlank
    private String flowType;

    private String remark;
}
