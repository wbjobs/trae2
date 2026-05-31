package com.doccollab.entity;

import lombok.Data;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@Document(collection = "orphaned_files")
public class OrphanedFile {

    @Id
    private String id;

    @Indexed
    private String tenantId;

    private String filePath;

    private String fileName;

    private Long fileSize;

    private String status;

    private String source;

    @Indexed
    @CreatedDate
    private LocalDateTime createdAt;

    private LocalDateTime cleanedAt;
}
