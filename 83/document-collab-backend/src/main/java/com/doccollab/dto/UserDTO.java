package com.doccollab.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class UserDTO {

    private String id;

    private String tenantId;

    private String username;

    private String email;

    private String role;

    private Integer status;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
