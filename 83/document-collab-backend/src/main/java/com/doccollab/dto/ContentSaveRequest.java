package com.doccollab.dto;

import lombok.Data;

@Data
public class ContentSaveRequest {
    private String content;
    private String changeLog;
    private Long expectedVersion;
}
