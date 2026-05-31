package com.research.asset.service;

import com.research.asset.dto.UploadChunkDTO;
import com.research.asset.dto.UploadInitDTO;
import com.research.asset.dto.UploadResponse;
import com.research.asset.dto.UploadTaskDTO;
import com.research.asset.entity.UploadChunk;
import com.research.asset.entity.UploadTask;
import com.research.asset.repository.UploadChunkRepository;
import com.research.asset.repository.UploadTaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChunkUploadService {

    private final UploadTaskRepository uploadTaskRepository;
    private final UploadChunkRepository uploadChunkRepository;
    private final OssService ossService;

    @Transactional
    public UploadTaskDTO initUpload(UploadInitDTO dto, UUID userId) {
        String uploadId = UUID.randomUUID().toString().replace("-", "");
        int totalChunks = (int) Math.ceil((double) dto.getFileSize() / dto.getChunkSize());

        UploadTask task = new UploadTask();
        task.setUploadId(uploadId);
        task.setFileName(dto.getFileName());
        task.setFileSize(dto.getFileSize());
        task.setFileType(dto.getFileType());
        task.setMimeType(dto.getMimeType());
        task.setChunkSize(dto.getChunkSize());
        task.setTotalChunks(totalChunks);
        task.setUserId(userId);
        task.setStatus("INIT");

        uploadTaskRepository.save(task);
        return convertToDTO(task);
    }

    @Transactional
    public UploadResponse uploadChunk(MultipartFile file, UploadChunkDTO dto) {
        UploadTask task = uploadTaskRepository.findByUploadId(dto.getUploadId())
                .orElseThrow(() -> new RuntimeException("上传任务不存在"));

        if ("PAUSED".equals(task.getStatus()) || "COMPLETED".equals(task.getStatus()) || "FAILED".equals(task.getStatus())) {
            throw new RuntimeException("上传任务状态不允许上传");
        }

        if ("INIT".equals(task.getStatus())) {
            task.setStatus("UPLOADING");
            uploadTaskRepository.save(task);
        }

        int existingCount = uploadChunkRepository.countByUploadId(dto.getUploadId());
        UploadChunk existingChunk = uploadChunkRepository.findByUploadIdOrderByChunkNumberAsc(dto.getUploadId())
                .stream()
                .filter(c -> c.getChunkNumber().equals(dto.getChunkNumber()))
                .findFirst()
                .orElse(null);

        if (existingChunk != null) {
            return new UploadResponse(dto.getUploadId(), dto.getChunkNumber(), true, existingCount + 1 >= task.getTotalChunks());
        }

        String chunkOssKey = dto.getUploadId() + "_" + dto.getChunkNumber();
        ossService.uploadChunk(file, chunkOssKey);

        UploadChunk chunk = new UploadChunk();
        chunk.setUploadId(dto.getUploadId());
        chunk.setChunkNumber(dto.getChunkNumber());
        chunk.setChunkSize(dto.getChunkSize());
        chunk.setOssKey(chunkOssKey);
        chunk.setMd5(dto.getMd5());
        uploadChunkRepository.save(chunk);

        int uploadedCount = uploadChunkRepository.countByUploadId(dto.getUploadId());
        long uploadedSize = uploadedCount * (long) task.getChunkSize();
        if (uploadedSize > task.getFileSize()) {
            uploadedSize = task.getFileSize();
        }

        task.setUploadedChunks(uploadedCount);
        task.setUploadedSize(uploadedSize);
        uploadTaskRepository.save(task);

        boolean shouldMerge = uploadedCount >= task.getTotalChunks();
        return new UploadResponse(dto.getUploadId(), dto.getChunkNumber(), true, shouldMerge);
    }

    public boolean checkChunk(UploadChunkDTO dto) {
        return uploadChunkRepository.findByUploadIdOrderByChunkNumberAsc(dto.getUploadId())
                .stream()
                .anyMatch(c -> c.getChunkNumber().equals(dto.getChunkNumber()));
    }

    @Transactional
    public String mergeChunks(String uploadId) {
        UploadTask task = uploadTaskRepository.findByUploadId(uploadId)
                .orElseThrow(() -> new RuntimeException("上传任务不存在"));

        List<UploadChunk> chunks = uploadChunkRepository.findByUploadIdOrderByChunkNumberAsc(uploadId);
        if (chunks.size() < task.getTotalChunks()) {
            throw new RuntimeException("分片不完整，无法合并");
        }

        String originalFilename = task.getFileName();
        String extension = "";
        if (originalFilename != null && originalFilename.contains(".")) {
            extension = originalFilename.substring(originalFilename.lastIndexOf("."));
        }
        String finalOssKey = UUID.randomUUID().toString().replace("-", "") + extension;

        List<String> chunkOssKeys = chunks.stream()
                .map(UploadChunk::getOssKey)
                .collect(Collectors.toList());

        ossService.mergeChunks(chunkOssKeys, finalOssKey);

        task.setOssKey(finalOssKey);
        task.setStatus("COMPLETED");
        task.setCompletedAt(LocalDateTime.now());
        uploadTaskRepository.save(task);

        return finalOssKey;
    }

    @Transactional
    public void pauseUpload(String uploadId) {
        UploadTask task = uploadTaskRepository.findByUploadId(uploadId)
                .orElseThrow(() -> new RuntimeException("上传任务不存在"));
        task.setStatus("PAUSED");
        uploadTaskRepository.save(task);
    }

    @Transactional
    public UploadTaskDTO resumeUpload(String uploadId) {
        UploadTask task = uploadTaskRepository.findByUploadId(uploadId)
                .orElseThrow(() -> new RuntimeException("上传任务不存在"));
        task.setStatus("UPLOADING");
        uploadTaskRepository.save(task);
        return convertToDTO(task);
    }

    public UploadTaskDTO getUploadTask(String uploadId) {
        UploadTask task = uploadTaskRepository.findByUploadId(uploadId)
                .orElseThrow(() -> new RuntimeException("上传任务不存在"));
        return convertToDTO(task);
    }

    public List<UploadTaskDTO> getUserUploadTasks(UUID userId) {
        List<UploadTask> tasks = uploadTaskRepository.findByUserIdAndStatus(userId, "UPLOADING");
        tasks.addAll(uploadTaskRepository.findByUserIdAndStatus(userId, "PAUSED"));
        return tasks.stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    @Transactional
    public void cancelUpload(String uploadId) {
        UploadTask task = uploadTaskRepository.findByUploadId(uploadId)
                .orElseThrow(() -> new RuntimeException("上传任务不存在"));

        List<UploadChunk> chunks = uploadChunkRepository.findByUploadIdOrderByChunkNumberAsc(uploadId);
        for (UploadChunk chunk : chunks) {
            try {
                ossService.deleteFile(chunk.getOssKey());
            } catch (Exception e) {
                log.error("删除分片失败: {}", chunk.getOssKey(), e);
            }
        }

        uploadChunkRepository.deleteByUploadId(uploadId);
        uploadTaskRepository.deleteByUploadId(uploadId);
    }

    @Transactional
    public void cleanupExpiredUploads() {
        log.info("开始清理过期上传任务...");
        LocalDateTime now = LocalDateTime.now();
        int deletedCount = 0;

        List<UploadTask> expiredTasks = uploadTaskRepository.findByStatusAndExpiredAtBefore("INIT", now);
        expiredTasks.addAll(uploadTaskRepository.findByStatusAndExpiredAtBefore("UPLOADING", now));
        expiredTasks.addAll(uploadTaskRepository.findByStatusAndExpiredAtBefore("PAUSED", now));

        for (UploadTask task : expiredTasks) {
            try {
                List<UploadChunk> chunks = uploadChunkRepository.findByUploadIdOrderByChunkNumberAsc(task.getUploadId());
                for (UploadChunk chunk : chunks) {
                    try {
                        ossService.deleteFile(chunk.getOssKey());
                    } catch (Exception e) {
                        log.error("删除过期分片失败: {}", chunk.getOssKey(), e);
                    }
                }
                uploadChunkRepository.deleteByUploadId(task.getUploadId());
                uploadTaskRepository.delete(task);
                deletedCount++;
                log.info("已清理过期上传任务: {}", task.getUploadId());
            } catch (Exception e) {
                log.error("清理过期上传任务失败: {}", task.getUploadId(), e);
            }
        }

        log.info("过期上传任务清理完成，共清理 {} 个任务", deletedCount);
    }

    private UploadTaskDTO convertToDTO(UploadTask task) {
        UploadTaskDTO dto = new UploadTaskDTO();
        dto.setUploadId(task.getUploadId());
        dto.setFileName(task.getFileName());
        dto.setFileSize(task.getFileSize());
        dto.setFileType(task.getFileType());
        dto.setChunkSize(task.getChunkSize());
        dto.setTotalChunks(task.getTotalChunks());
        dto.setUploadedChunks(task.getUploadedChunks());
        dto.setUploadedSize(task.getUploadedSize());
        dto.setStatus(task.getStatus());
        dto.setOssKey(task.getOssKey());
        dto.setCreatedAt(task.getCreatedAt());
        dto.setCompletedAt(task.getCompletedAt());

        List<Integer> uploadedChunkNumbers = uploadChunkRepository.findByUploadIdOrderByChunkNumberAsc(task.getUploadId())
                .stream()
                .map(UploadChunk::getChunkNumber)
                .collect(Collectors.toList());
        dto.setUploadedChunkNumbers(uploadedChunkNumbers);

        return dto;
    }
}
