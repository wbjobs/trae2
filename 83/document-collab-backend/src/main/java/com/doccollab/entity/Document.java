package com.doccollab.entity;

import lombok.Data;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@Document(collection = "documents")
@CompoundIndexes({
        @CompoundIndex(name = "tenant_name_unique", def = "{'tenantId': 1, 'name': 1}", unique = true)
})
public class Document {

    @Id
    private String id;

    private String tenantId;

    private String name;

    private String description;

    private String currentVersionId;

    private Long version;

    private String createdBy;

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
