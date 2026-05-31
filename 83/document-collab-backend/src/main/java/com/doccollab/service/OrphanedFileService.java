package com.doccollab.service;

import com.doccollab.entity.OrphanedFile;

import java.util.List;

public interface OrphanedFileService {

    OrphanedFile recordOrphanedFile(String tenantId, String filePath, String fileName, Long fileSize, String source);

    List<OrphanedFile> getPendingOrphanedFiles();

    void markAsCleaned(String orphanedFileId);

    void cleanupOrphanedFiles();
}
