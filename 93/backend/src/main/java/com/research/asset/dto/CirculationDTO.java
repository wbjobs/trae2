package com.research.asset.dto;

import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class CirculationDTO {

    private UUID id;
    private UUID assetId;
    private String assetTitle;
    private UUID borrowerId;
    private String borrowerName;
    private String borrowPurpose;
    private LocalDate borrowDate;
    private LocalDate expectedReturnDate;
    private LocalDate actualReturnDate;
    private String status;
    private String approverName;
    private LocalDateTime approvedAt;
    private LocalDateTime createdAt;
}
