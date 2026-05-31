package com.research.asset.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
public class ApprovalInstanceDTO {

    private UUID id;
    private String flowName;
    private String flowType;
    private UUID assetId;
    private String assetTitle;
    private String initiatorName;
    private String currentNodeName;
    private Integer currentNodeOrder;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime completedAt;
    private List<ApprovalLogDTO> logs;
}
