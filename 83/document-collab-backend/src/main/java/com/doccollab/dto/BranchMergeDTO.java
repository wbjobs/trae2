package com.doccollab.dto;

import lombok.Data;

@Data
public class BranchMergeDTO {
    private String sourceBranchId;
    private String targetBranchId;
    private String mergeStrategy;
    private String changeLog;
}
