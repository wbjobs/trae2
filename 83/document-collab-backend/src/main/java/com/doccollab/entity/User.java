package com.doccollab.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@Document(collection = "users")
@CompoundIndex(name = "tenant_username_idx", def = "{'tenantId': 1, 'username': 1}", unique = true)
public class User {

    @Id
    private String id;

    @Indexed
    private String tenantId;

    private String username;

    @Indexed(unique = true)
    private String email;

    private String password;

    private String role;

    private Integer status;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
