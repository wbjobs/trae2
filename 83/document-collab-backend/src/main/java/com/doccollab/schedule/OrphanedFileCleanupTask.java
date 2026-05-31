package com.doccollab.schedule;

import com.doccollab.service.OrphanedFileService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

@Slf4j
@Component
public class OrphanedFileCleanupTask {

    @Resource
    private OrphanedFileService orphanedFileService;

    @Scheduled(fixedRate = 3600000)
    public void cleanupOrphanedFiles() {
        log.info("Starting orphaned file cleanup task...");
        try {
            orphanedFileService.cleanupOrphanedFiles();
            log.info("Orphaned file cleanup task completed.");
        } catch (Exception e) {
            log.error("Orphaned file cleanup task failed: {}", e.getMessage(), e);
        }
    }
}
