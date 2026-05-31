package com.research.asset.dto;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.UUID;

@Data
public class CirculationApplyDTO {

    @NotNull
    private UUID assetId;

    @NotBlank
    private String borrowPurpose;

    @NotNull
    private LocalDate borrowDate;

    @NotNull
    private LocalDate expectedReturnDate;
}
