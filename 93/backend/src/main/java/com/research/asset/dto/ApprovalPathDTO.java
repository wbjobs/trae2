package com.research.asset.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ApprovalPathDTO {

    private UUID nodeId;

    private String nodeName;

    private UUID approverId;

    private String approverName;

    private String result;

    private String comment;

    private LocalDateTime time;

    private Boolean isCurrent;

    private Boolean isCompleted;

    private Integer nodeOrder;

    private String conditionExpression;

    private Boolean isSkippable;
}
