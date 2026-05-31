package com.research.asset.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class ApprovalLogDTO {

    private UUID id;
    private String nodeName;
    private String approverName;
    private String action;
    private String comment;
    private LocalDateTime createdAt;
}
