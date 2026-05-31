package com.doccollab.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TenantDTO {

    private String id;

    private String tenantId;

    private String tenantName;

    private String email;

    private Integer status;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
