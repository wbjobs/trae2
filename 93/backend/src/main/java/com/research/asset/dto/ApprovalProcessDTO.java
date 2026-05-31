package com.research.asset.dto;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

@Data
public class ApprovalProcessDTO {

    @NotNull
    private UUID instanceId;

    @NotBlank
    private String action;

    private String comment;
}
