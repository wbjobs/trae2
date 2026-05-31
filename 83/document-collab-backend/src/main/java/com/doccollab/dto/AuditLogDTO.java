package com.doccollab.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AuditLogDTO {
    private String id;
    private String tenantId;
    private String userId;
    private String username;
    private String module;
    private String operation;
    private String method;
    private String requestUri;
    private String requestMethod;
    private String ipAddress;
    private String userAgent;
    private String params;
    private String result;
    private String status;
    private Long durationMs;
    private String errorMessage;
    private LocalDateTime createdAt;
}
