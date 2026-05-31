package com.doccollab.entity;

import lombok.Data;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@Document(collection = "audit_logs")
public class AuditLog {

    @Id
    private String id;

    @Indexed
    private String tenantId;

    @Indexed
    private String userId;

    private String username;

    @Indexed
    private String module;

    @Indexed
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

    @CreatedDate
    @Indexed
    private LocalDateTime createdAt;
}
