package com.doccollab.service.impl;

import com.doccollab.dto.ChunkUploadDTO;
import com.doccollab.dto.ChunkUploadResponse;
import com.doccollab.dto.DocumentVersionDTO;
import com.doccollab.dto.VersionSnapshotDTO;
import com.doccollab.entity.ChunkUploadSession;
import com.doccollab.exception.BusinessException;
import com.doccollab.repository.ChunkUploadSessionRepository;
import com.doccollab.service.ChunkUploadService;
import com.doccollab.service.MinioService;
import com.doccollab.service.VersionService;
import io.minio.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.codec.digest.DigestUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChunkUploadServiceImpl implements ChunkUploadService {

    private final MinioClient minioClient;

    @Value("${minio.bucketName}")
    private String bucketName;

    @Resource
    private ChunkUploadSessionRepository sessionRepository;

    @Resource
    private MinioService minioService;

    @Resource
    private VersionService versionService;

    @Resource
    private MongoTemplate mongoTemplate;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ChunkUploadResponse uploadChunk(String tenantId, String userId, ChunkUploadDTO chunkDTO) {
        if (chunkDTO.getChunkData() == null || chunkDTO.getChunkData().length == 0) {
            throw new BusinessException("分片数据不能为空");
        }

        ChunkUploadSession session;
        if (chunkDTO.getUploadId() == null || chunkDTO.getUploadId().isEmpty()) {
            session = createSession(tenantId, userId, chunkDTO);
        } else {
            session = sessionRepository.findByUploadIdAndTenantId(chunkDTO.getUploadId(), tenantId)
                    .orElseThrow(() -> new BusinessException("上传会话不存在或已过期"));
        }

        if (!"UPLOADING".equals(session.getStatus())) {
            throw new BusinessException("上传会话状态异常: " + session.getStatus());
        }

        if (chunkDTO.getChunkIndex() < 0 || chunkDTO.getChunkIndex() >= session.getTotalChunks()) {
            throw new BusinessException("分片索引超出范围");
        }

        String chunkObjectName = getChunkObjectName(session.getUploadId(), chunkDTO.getChunkIndex());

        try {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucketName)
                            .object(chunkObjectName)
                            .stream(new ByteArrayInputStream(chunkDTO.getChunkData()), -1, 10 * 1024 * 1024)
                            .contentType("application/octet-stream")
                            .build()
            );
        } catch (Exception e) {
            throw new BusinessException("分片上传失败: " + e.getMessage());
        }

        Query query = new Query();
        query.addCriteria(Criteria.where("uploadId").is(session.getUploadId()));
        Update update = new Update();
        update.addToSet("uploadedChunks", chunkDTO.getChunkIndex());
        update.set("updatedAt", LocalDateTime.now());
        mongoTemplate.updateFirst(query, update, ChunkUploadSession.class);

        session = sessionRepository.findByUploadId(session.getUploadId()).orElseThrow();
        boolean allUploaded = session.getUploadedChunks().size() == session.getTotalChunks();

        if (allUploaded) {
            return new ChunkUploadResponse(session.getUploadId(), chunkDTO.getChunkIndex(), "CHUNKS_COMPLETE", null);
        }

        return new ChunkUploadResponse(session.getUploadId(), chunkDTO.getChunkIndex(), "CHUNK_UPLOADED", null);
    }

    @Override
    public ChunkUploadResponse checkChunk(String tenantId, String uploadId, Integer chunkIndex) {
        ChunkUploadSession session = sessionRepository.findByUploadIdAndTenantId(uploadId, tenantId)
                .orElseThrow(() -> new BusinessException("上传会话不存在"));

        boolean uploaded = session.getUploadedChunks().contains(chunkIndex);
        return new ChunkUploadResponse(uploadId, chunkIndex, uploaded ? "EXISTS" : "NOT_EXISTS", null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ChunkUploadResponse mergeChunks(String tenantId, String userId, String uploadId) {
        ChunkUploadSession session = sessionRepository.findByUploadIdAndTenantId(uploadId, tenantId)
                .orElseThrow(() -> new BusinessException("上传会话不存在"));

        if (!"UPLOADING".equals(session.getStatus())) {
            throw new BusinessException("上传会话状态异常");
        }

        if (session.getUploadedChunks().size() != session.getTotalChunks()) {
            throw new BusinessException("分片未全部上传完成");
        }

        try {
            String filePath = generateFilePath(tenantId, session.getDocumentId(), session.getFileName());

            List<ComposeSource> sources = new ArrayList<>();
            for (int i = 0; i < session.getTotalChunks(); i++) {
                sources.add(
                        ComposeSource.builder()
                                .bucket(bucketName)
                                .object(getChunkObjectName(uploadId, i))
                                .build()
                );
            }

            minioClient.composeObject(
                    ComposeObjectArgs.builder()
                            .bucket(bucketName)
                            .object(tenantId + "/" + filePath)
                            .sources(sources)
                            .build()
            );

            String mergedHash = verifyMergedFile(tenantId, filePath, session.getFileSize());
            if (session.getFileHash() != null && !session.getFileHash().equalsIgnoreCase(mergedHash)) {
                throw new BusinessException("文件合并后校验失败，MD5不匹配");
            }

            VersionSnapshotDTO snapshotDTO = new VersionSnapshotDTO();
            snapshotDTO.setDocumentId(session.getDocumentId());
            snapshotDTO.setFileName(session.getFileName());
            snapshotDTO.setFilePath(filePath);
            snapshotDTO.setFileSize(session.getFileSize());
            snapshotDTO.setMimeType(session.getMimeType());
            snapshotDTO.setSnapshotHash(mergedHash);
            snapshotDTO.setChangeLog(session.getChangeLog());

            try (InputStream is = minioService.downloadFile(tenantId, filePath)) {
                snapshotDTO.setFileContent(is.readAllBytes());
            }

            DocumentVersionDTO version = versionService.createVersion(tenantId, userId, snapshotDTO);

            Query query = new Query();
            query.addCriteria(Criteria.where("uploadId").is(uploadId));
            Update update = new Update();
            update.set("status", "COMPLETED");
            update.set("filePath", filePath);
            update.set("updatedAt", LocalDateTime.now());
            mongoTemplate.updateFirst(query, update, ChunkUploadSession.class);

            for (int i = 0; i < session.getTotalChunks(); i++) {
                try {
                    minioClient.removeObject(
                            RemoveObjectArgs.builder()
                                    .bucket(bucketName)
                                    .object(getChunkObjectName(uploadId, i))
                                    .build()
                    );
                } catch (Exception e) {
                    log.warn("Failed to delete chunk {}: {}", i, e.getMessage());
                }
            }

            return new ChunkUploadResponse(uploadId, -1, "MERGED", version);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("文件合并失败: " + e.getMessage());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ChunkUploadResponse cancelUpload(String tenantId, String uploadId) {
        ChunkUploadSession session = sessionRepository.findByUploadIdAndTenantId(uploadId, tenantId)
                .orElseThrow(() -> new BusinessException("上传会话不存在"));

        Query query = new Query();
        query.addCriteria(Criteria.where("uploadId").is(uploadId));
        Update update = new Update();
        update.set("status", "CANCELLED");
        update.set("updatedAt", LocalDateTime.now());
        mongoTemplate.updateFirst(query, update, ChunkUploadSession.class);

        for (int i = 0; i < session.getTotalChunks(); i++) {
            try {
                minioClient.removeObject(
                        RemoveObjectArgs.builder()
                                .bucket(bucketName)
                                .object(getChunkObjectName(uploadId, i))
                                .build()
                );
            } catch (Exception e) {
                log.warn("Failed to delete chunk {}: {}", i, e.getMessage());
            }
        }

        return new ChunkUploadResponse(uploadId, -1, "CANCELLED", null);
    }

    private ChunkUploadSession createSession(String tenantId, String userId, ChunkUploadDTO chunkDTO) {
        if (chunkDTO.getFileHash() != null) {
            sessionRepository.findByFileHashAndTenantIdAndStatus(chunkDTO.getFileHash(), tenantId, "COMPLETED")
                    .ifPresent(existing -> {
                        throw new BusinessException("文件已存在，秒传成功");
                    });
        }

        String uploadId = UUID.randomUUID().toString();
        String fileName = chunkDTO.getFileName();

        ChunkUploadSession session = new ChunkUploadSession();
        session.setUploadId(uploadId);
        session.setTenantId(tenantId);
        session.setDocumentId(chunkDTO.getDocumentId());
        session.setFileName(fileName);
        session.setFileHash(chunkDTO.getFileHash());
        session.setFileSize(chunkDTO.getFileSize());
        session.setTotalChunks(chunkDTO.getTotalChunks());
        session.setChunkSize(chunkDTO.getChunkSize());
        session.setMimeType(chunkDTO.getMimeType() != null ? chunkDTO.getMimeType() : "application/octet-stream");
        session.setChangeLog(chunkDTO.getChangeLog());
        session.setCreatedBy(userId);
        session.setStatus("UPLOADING");
        session.setCreatedAt(LocalDateTime.now());
        session.setUpdatedAt(LocalDateTime.now());

        return sessionRepository.save(session);
    }

    private String getChunkObjectName(String uploadId, int chunkIndex) {
        return "_chunks/" + uploadId + "/" + chunkIndex;
    }

    private String generateFilePath(String tenantId, String documentId, String fileName) {
        String extension = "";
        int dotIndex = fileName.lastIndexOf('.');
        if (dotIndex > 0) {
            extension = fileName.substring(dotIndex);
        }
        return tenantId + "/" + documentId + "/" + UUID.randomUUID().toString() + extension;
    }

    private String verifyMergedFile(String tenantId, String filePath, long expectedSize) {
        try (InputStream is = minioService.downloadFile(tenantId, filePath)) {
            byte[] allBytes = is.readAllBytes();
            if (allBytes.length != expectedSize) {
                throw new BusinessException("文件大小不匹配，期望: " + expectedSize + ", 实际: " + allBytes.length);
            }
            return DigestUtils.md5Hex(allBytes);
        } catch (IOException e) {
            throw new BusinessException("读取合并文件失败: " + e.getMessage());
        }
    }

    @Scheduled(fixedRate = 3600000)
    public void cleanupExpiredSessions() {
        LocalDateTime threshold = LocalDateTime.now().minusHours(24);
        List<ChunkUploadSession> expiredSessions = sessionRepository
                .findByStatusAndCreatedAtBefore("UPLOADING", threshold);

        for (ChunkUploadSession session : expiredSessions) {
            try {
                cancelUpload(session.getTenantId(), session.getUploadId());
                log.info("Cleaned up expired chunk upload session: {}", session.getUploadId());
            } catch (Exception e) {
                log.error("Failed to cleanup expired session {}: {}", session.getUploadId(), e.getMessage());
            }
        }
    }
}
