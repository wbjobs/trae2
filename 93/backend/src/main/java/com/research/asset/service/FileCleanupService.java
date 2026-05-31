package com.research.asset.service;

import com.research.asset.entity.AssetFile;
import com.research.asset.entity.TempFile;
import com.research.asset.repository.AssetFileRepository;
import com.research.asset.repository.TempFileRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class FileCleanupService {

    private final TempFileRepository tempFileRepository;
    private final AssetFileRepository assetFileRepository;
    private final OssService ossService;
    private final ChunkUploadService chunkUploadService;

    @Scheduled(cron = "0 0 2 * * ?")
    @Transactional
    public void cleanupOrphanFiles() {
        log.info("开始清理孤立无效附件文件...");
        LocalDateTime now = LocalDateTime.now();
        int deletedCount = 0;

        List<TempFile> expiredTempFiles = tempFileRepository.findByIsAttachedFalseAndExpiresAtBefore(now);
        for (TempFile tempFile : expiredTempFiles) {
            try {
                ossService.deleteFile(tempFile.getOssKey());
                log.info("已删除OSS孤立文件: {}", tempFile.getOssKey());
                deletedCount++;
            } catch (Exception e) {
                log.error("删除OSS文件失败: {}, 错误: {}", tempFile.getOssKey(), e.getMessage());
            }
        }
        tempFileRepository.deleteByIsAttachedFalseAndExpiresAtBefore(now);

        List<AssetFile> expiredAssetFiles = assetFileRepository.findByIsTemporaryTrueAndExpiresAtBefore(now);
        for (AssetFile assetFile : expiredAssetFiles) {
            try {
                ossService.deleteFile(assetFile.getOssKey());
                log.info("已删除过期临时资产文件: {}", assetFile.getOssKey());
                deletedCount++;
            } catch (Exception e) {
                log.error("删除资产文件失败: {}, 错误: {}", assetFile.getOssKey(), e.getMessage());
            }
        }
        assetFileRepository.deleteByIsTemporaryTrueAndExpiresAtBefore(now);

        log.info("孤立文件清理完成，共删除 {} 个文件", deletedCount);
    }

    @Scheduled(cron = "0 0 */6 * * ?")
    @Transactional(readOnly = true)
    public void checkOrphanFiles() {
        long count = tempFileRepository.countByIsAttachedFalseAndExpiresAtBefore(LocalDateTime.now());
        if (count > 0) {
            log.warn("检测到 {} 个待清理的孤立临时文件", count);
        }
    }

    public TempFile recordTempFile(String ossKey, String ossBucket, String originalFileName,
                                   Long fileSize, String fileType, java.util.UUID uploadedBy, String session) {
        TempFile tempFile = new TempFile();
        tempFile.setOssKey(ossKey);
        tempFile.setOssBucket(ossBucket);
        tempFile.setOriginalFileName(originalFileName);
        tempFile.setFileSize(fileSize);
        tempFile.setFileType(fileType);
        tempFile.setUploadedBy(uploadedBy);
        tempFile.setUploadSession(session);
        return tempFileRepository.save(tempFile);
    }

    public void markFileAttached(String ossKey) {
        tempFileRepository.findByOssKey(ossKey).ifPresent(tempFile -> {
            tempFile.setIsAttached(true);
            tempFileRepository.save(tempFile);
        });
    }

    @Transactional
    public void deleteSessionFiles(String session) {
        List<TempFile> sessionFiles = tempFileRepository.findByUploadSession(session);
        for (TempFile file : sessionFiles) {
            if (!file.getIsAttached()) {
                try {
                    ossService.deleteFile(file.getOssKey());
                } catch (Exception e) {
                    log.error("删除会话文件失败: {}", e.getMessage());
                }
            }
        }
        tempFileRepository.deleteAll(sessionFiles);
    }

    public long getOrphanFileCount() {
        return tempFileRepository.countByIsAttachedFalseAndExpiresAtBefore(LocalDateTime.now());
    }

    @Scheduled(cron = "0 0 3 * * ?")
    public void cleanupExpiredChunkUploads() {
        chunkUploadService.cleanupExpiredUploads();
    }
}
