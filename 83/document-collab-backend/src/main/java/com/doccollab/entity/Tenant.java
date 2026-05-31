package com.doccollab.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@Document(collection = "tenants")
public class Tenant {

    @Id
    private String id;

    @Indexed(unique = true)
    private String tenantId;

    private String tenantName;

    @Indexed(unique = true)
    private String email;

    private String password;

    private Integer status;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
