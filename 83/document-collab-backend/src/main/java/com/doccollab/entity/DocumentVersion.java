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
@Document(collection = "document_versions")
@CompoundIndexes({
        @CompoundIndex(name = "doc_version_unique", def = "{'documentId': 1, 'versionNumber': 1}", unique = true)
})
public class DocumentVersion {

    @Id
    private String id;

    private String documentId;

    @Indexed
    private String tenantId;

    private Integer versionNumber;

    private Integer baseVersionNumber;

    private String fileName;

    private String filePath;

    private Long fileSize;

    private String mimeType;

    private String snapshotHash;

    private String changeLog;

    private String createdBy;

    @CreatedDate
    private LocalDateTime createdAt;

    private Boolean isLatest;
}
