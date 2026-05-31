package com.doccollab.service.impl;

import com.doccollab.entity.DocumentVersion;
import com.doccollab.entity.OrphanedFile;
import com.doccollab.repository.DocumentVersionRepository;
import com.doccollab.repository.OrphanedFileRepository;
import com.doccollab.service.MinioService;
import com.doccollab.service.OrphanedFileService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
public class OrphanedFileServiceImpl implements OrphanedFileService {

    @Resource
    private OrphanedFileRepository orphanedFileRepository;

    @Resource
    private MinioService minioService;

    @Resource
    private DocumentVersionRepository documentVersionRepository;

    @Resource
    private MongoTemplate mongoTemplate;

    @Override
    public OrphanedFile recordOrphanedFile(String tenantId, String filePath, String fileName, Long fileSize, String source) {
        OrphanedFile orphanedFile = new OrphanedFile();
        orphanedFile.setTenantId(tenantId);
        orphanedFile.setFilePath(filePath);
        orphanedFile.setFileName(fileName);
        orphanedFile.setFileSize(fileSize);
        orphanedFile.setStatus("PENDING");
        orphanedFile.setSource(source);
        return orphanedFileRepository.save(orphanedFile);
    }

    @Override
    public List<OrphanedFile> getPendingOrphanedFiles() {
        return orphanedFileRepository.findByStatus("PENDING");
    }

    @Override
    public void markAsCleaned(String orphanedFileId) {
        OrphanedFile file = orphanedFileRepository.findById(orphanedFileId).orElse(null);
        if (file != null) {
            file.setStatus("CLEANED");
            file.setCleanedAt(LocalDateTime.now());
            orphanedFileRepository.save(file);
        }
    }

    @Override
    public void cleanupOrphanedFiles() {
        cleanupRecordedOrphanedFiles();

        cleanupUnrecordedOrphanedMinioFiles();

        checkMissingMinioFiles();
    }

    private void cleanupRecordedOrphanedFiles() {
        LocalDateTime threshold = LocalDateTime.now().minusMinutes(30);
        List<OrphanedFile> pendingFiles = orphanedFileRepository.findByStatusAndCreatedAtBefore("PENDING", threshold);

        for (OrphanedFile orphanedFile : pendingFiles) {
            boolean isReferenced = isFilePathReferenced(orphanedFile.getFilePath());
            if (!isReferenced) {
                try {
                    minioService.deleteFile(orphanedFile.getTenantId(), orphanedFile.getFilePath());
                    markAsCleaned(orphanedFile.getId());
                    log.info("Cleaned orphaned file: {}, path: {}", orphanedFile.getId(), orphanedFile.getFilePath());
                } catch (Exception e) {
                    log.warn("Failed to clean orphaned file: {}, error: {}", orphanedFile.getId(), e.getMessage());
                }
            } else {
                orphanedFile.setStatus("CLAIMED");
                orphanedFileRepository.save(orphanedFile);
                log.info("Orphaned file claimed by version: {}", orphanedFile.getFilePath());
            }
        }
    }

    private void cleanupUnrecordedOrphanedMinioFiles() {
        List<DocumentVersion> allVersions = documentVersionRepository.findAll();
        Set<String> referencedPaths = new HashSet<>();
        for (DocumentVersion version : allVersions) {
            if (version.getFilePath() != null) {
                referencedPaths.add(version.getFilePath());
            }
        }

        Set<String> allTenantIds = new HashSet<>();
        for (DocumentVersion version : allVersions) {
            if (version.getTenantId() != null) {
                allTenantIds.add(version.getTenantId());
            }
        }

        for (String tenantId : allTenantIds) {
            try {
                List<String> minioKeys = minioService.listObjectKeys(tenantId + "/");
                for (String key : minioKeys) {
                    String filePath = key;
                    if (!referencedPaths.contains(filePath)) {
                        boolean alreadyRecorded = isOrphanedFileRecorded(filePath);
                        if (!alreadyRecorded) {
                            recordOrphanedFile(tenantId, filePath, extractFileName(key), 0L, "MINIO_SCAN_ORPHANED");
                            log.info("Found unrecorded orphaned MinIO file: {}", filePath);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to scan MinIO objects for tenant {}: {}", tenantId, e.getMessage());
            }
        }
    }

    private void checkMissingMinioFiles() {
        List<DocumentVersion> allVersions = documentVersionRepository.findAll();
        for (DocumentVersion version : allVersions) {
            if (version.getFilePath() != null) {
                try {
                    minioService.downloadFile(version.getTenantId(), version.getFilePath()).close();
                } catch (Exception e) {
                    log.warn("Version {} (v{}) references missing MinIO file: {}", version.getId(), version.getVersionNumber(), version.getFilePath());
                }
            }
        }
    }

    private boolean isFilePathReferenced(String filePath) {
        Query query = new Query();
        query.addCriteria(Criteria.where("filePath").is(filePath));
        return mongoTemplate.exists(query, DocumentVersion.class);
    }

    private boolean isOrphanedFileRecorded(String filePath) {
        Query query = new Query();
        query.addCriteria(Criteria.where("filePath").is(filePath).and("status").in("PENDING", "CLAIMED"));
        return mongoTemplate.exists(query, OrphanedFile.class);
    }

    private String extractFileName(String objectKey) {
        if (objectKey == null) return "unknown";
        int lastSlash = objectKey.lastIndexOf('/');
        return lastSlash >= 0 ? objectKey.substring(lastSlash + 1) : objectKey;
    }
}
