package com.doccollab.entity;

import lombok.Data;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@Document(collection = "document_branches")
@CompoundIndexes({
        @CompoundIndex(name = "doc_branch_name_unique", def = "{'documentId': 1, 'name': 1}", unique = true)
})
public class DocumentBranch {

    @Id
    private String id;

    @Indexed
    private String documentId;

    @Indexed
    private String tenantId;

    private String name;

    private String description;

    private String baseVersionId;

    private Integer baseVersionNumber;

    private String currentVersionId;

    private Integer currentVersionNumber;

    private String createdBy;

    @CreatedDate
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    private String status;

    private Boolean isDefault;
}
