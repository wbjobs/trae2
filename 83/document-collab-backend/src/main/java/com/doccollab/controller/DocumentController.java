package com.doccollab.controller;

import com.doccollab.annotation.AuditLog;
import com.doccollab.dto.*;
import com.doccollab.exception.BusinessException;
import com.doccollab.security.CurrentUser;
import com.doccollab.service.ChunkUploadService;
import com.doccollab.service.DocumentBranchService;
import com.doccollab.service.DocumentService;
import com.doccollab.service.MinioService;
import com.doccollab.service.OrphanedFileService;
import com.doccollab.service.VersionService;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import javax.annotation.Resource;
import javax.validation.Valid;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    @Resource
    private DocumentService documentService;

    @Resource
    private VersionService versionService;

    @Resource
    private MinioService minioService;

    @Resource
    private OrphanedFileService orphanedFileService;

    @Resource
    private DocumentBranchService branchService;

    @Resource
    private ChunkUploadService chunkUploadService;

    @PostMapping
    @AuditLog(module = "DOCUMENT", operation = "创建文档")
    public Result<DocumentDTO> createDocument(@Valid @RequestBody DocumentCreateDTO createDTO) {
        CurrentUser currentUser = CurrentUser.get();
        DocumentDTO document = documentService.createDocument(currentUser.getTenantId(), currentUser.getUserId(), createDTO);
        return Result.success(document);
    }

    @GetMapping("/{documentId}")
    public Result<DocumentDTO> getDocument(@PathVariable String documentId) {
        CurrentUser currentUser = CurrentUser.get();
        DocumentDTO document = documentService.getDocumentById(currentUser.getTenantId(), documentId);
        return Result.success(document);
    }

    @GetMapping
    public Result<List<DocumentDTO>> getDocuments() {
        CurrentUser currentUser = CurrentUser.get();
        List<DocumentDTO> documents = documentService.getDocumentsByTenantId(currentUser.getTenantId());
        return Result.success(documents);
    }

    @PutMapping("/{documentId}")
    @AuditLog(module = "DOCUMENT", operation = "更新文档")
    public Result<DocumentDTO> updateDocument(
            @PathVariable String documentId,
            @RequestParam String name,
            @RequestParam(required = false) String description) {
        CurrentUser currentUser = CurrentUser.get();
        DocumentDTO document = documentService.updateDocument(currentUser.getTenantId(), documentId, name, description);
        return Result.success(document);
    }

    @DeleteMapping("/{documentId}")
    @AuditLog(module = "DOCUMENT", operation = "删除文档")
    public Result<Void> deleteDocument(@PathVariable String documentId) {
        CurrentUser currentUser = CurrentUser.get();
        documentService.deleteDocument(currentUser.getTenantId(), documentId);
        return Result.success();
    }

    @PostMapping("/{documentId}/versions")
    @AuditLog(module = "VERSION", operation = "创建版本")
    public Result<DocumentVersionDTO> createVersion(
            @PathVariable String documentId,
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) String changeLog) {
        CurrentUser currentUser = CurrentUser.get();
        try {
            VersionSnapshotDTO snapshotDTO = new VersionSnapshotDTO();
            snapshotDTO.setDocumentId(documentId);
            snapshotDTO.setFileName(file.getOriginalFilename());
            snapshotDTO.setFileSize(file.getSize());
            snapshotDTO.setMimeType(file.getContentType());
            snapshotDTO.setFileContent(file.getBytes());
            snapshotDTO.setChangeLog(changeLog);

            String filePath = generateFilePath(currentUser.getTenantId(), documentId, file.getOriginalFilename());
            snapshotDTO.setFilePath(filePath);

            DocumentVersionDTO version = versionService.createVersion(currentUser.getTenantId(), currentUser.getUserId(), snapshotDTO);
            return Result.success(version);
        } catch (BusinessException e) {
            orphanedFileService.recordOrphanedFile(currentUser.getTenantId(),
                    generateFilePath(currentUser.getTenantId(), documentId, file.getOriginalFilename()),
                    file.getOriginalFilename(), file.getSize(), "FILE_UPLOAD_VERSION_FAILED");
            throw e;
        } catch (Exception e) {
            orphanedFileService.recordOrphanedFile(currentUser.getTenantId(),
                    generateFilePath(currentUser.getTenantId(), documentId, file.getOriginalFilename()),
                    file.getOriginalFilename(), file.getSize(), "FILE_UPLOAD_FAILED");
            throw new BusinessException("文件上传失败：" + e.getMessage());
        }
    }

    @PostMapping("/{documentId}/content")
    @AuditLog(module = "VERSION", operation = "保存内容版本")
    public Result<DocumentVersionDTO> saveContent(
            @PathVariable String documentId,
            @RequestBody ContentSaveRequest contentRequest) {
        CurrentUser currentUser = CurrentUser.get();
        String filePath = null;
        boolean minioUploaded = false;
        try {
            String content = contentRequest.getContent();
            String changeLog = contentRequest.getChangeLog();
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);

            filePath = generateFilePath(currentUser.getTenantId(), documentId, "content.html");

            InputStream inputStream = new ByteArrayInputStream(bytes);
            minioService.uploadFile(currentUser.getTenantId(), filePath, inputStream, "text/html");
            minioUploaded = true;

            VersionSnapshotDTO snapshotDTO = new VersionSnapshotDTO();
            snapshotDTO.setDocumentId(documentId);
            snapshotDTO.setFileName("content.html");
            snapshotDTO.setFileSize((long) bytes.length);
            snapshotDTO.setMimeType("text/html");
            snapshotDTO.setFileContent(bytes);
            snapshotDTO.setChangeLog(changeLog);
            snapshotDTO.setFilePath(filePath);
            snapshotDTO.setExpectedVersion(contentRequest.getExpectedVersion());

            DocumentVersionDTO version = versionService.createVersion(currentUser.getTenantId(), currentUser.getUserId(), snapshotDTO);
            return Result.success(version);
        } catch (BusinessException e) {
            if (minioUploaded && filePath != null) {
                try {
                    minioService.deleteFile(currentUser.getTenantId(), filePath);
                } catch (Exception deleteEx) {
                    orphanedFileService.recordOrphanedFile(currentUser.getTenantId(), filePath, "content.html", 0L, "SAVE_CONTENT_ROLLBACK_FAILED");
                }
            }
            throw e;
        } catch (Exception e) {
            if (minioUploaded && filePath != null) {
                try {
                    minioService.deleteFile(currentUser.getTenantId(), filePath);
                } catch (Exception deleteEx) {
                    orphanedFileService.recordOrphanedFile(currentUser.getTenantId(), filePath, "content.html", 0L, "SAVE_CONTENT_ROLLBACK_FAILED");
                }
            }
            throw new BusinessException("内容保存失败：" + e.getMessage());
        }
    }

    @GetMapping("/{documentId}/versions")
    public Result<List<DocumentVersionDTO>> getVersions(@PathVariable String documentId) {
        CurrentUser currentUser = CurrentUser.get();
        List<DocumentVersionDTO> versions = versionService.getVersionsByDocumentId(currentUser.getTenantId(), documentId);
        return Result.success(versions);
    }

    @GetMapping("/{documentId}/versions/latest")
    public Result<DocumentVersionDTO> getLatestVersion(@PathVariable String documentId) {
        CurrentUser currentUser = CurrentUser.get();
        DocumentVersionDTO version = versionService.getLatestVersion(currentUser.getTenantId(), documentId);
        return Result.success(version);
    }

    @GetMapping("/{documentId}/versions/{versionNumber}")
    public Result<DocumentVersionDTO> getVersionByNumber(
            @PathVariable String documentId,
            @PathVariable Integer versionNumber) {
        CurrentUser currentUser = CurrentUser.get();
        DocumentVersionDTO version = versionService.getVersionByNumber(currentUser.getTenantId(), documentId, versionNumber);
        return Result.success(version);
    }

    @GetMapping("/{documentId}/versions/{versionNumber}/download")
    public ResponseEntity<InputStreamResource> downloadVersion(
            @PathVariable String documentId,
            @PathVariable Integer versionNumber) {
        CurrentUser currentUser = CurrentUser.get();
        DocumentVersionDTO version = versionService.getVersionByNumber(currentUser.getTenantId(), documentId, versionNumber);
        InputStream inputStream = minioService.downloadFile(currentUser.getTenantId(), version.getFilePath());

        String encodedFileName = URLEncoder.encode(version.getFileName(), StandardCharsets.UTF_8).replaceAll("\\+", "%20");

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodedFileName)
                .contentType(MediaType.parseMediaType(version.getMimeType() != null ? version.getMimeType() : "application/octet-stream"))
                .contentLength(version.getFileSize())
                .body(new InputStreamResource(inputStream));
    }

    @GetMapping("/{documentId}/versions/{versionNumber}/content")
    public Result<String> getVersionContent(
            @PathVariable String documentId,
            @PathVariable Integer versionNumber) {
        CurrentUser currentUser = CurrentUser.get();
        DocumentVersionDTO version = versionService.getVersionByNumber(currentUser.getTenantId(), documentId, versionNumber);
        try {
            InputStream inputStream = minioService.downloadFile(currentUser.getTenantId(), version.getFilePath());
            String content = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
            return Result.success(content);
        } catch (Exception e) {
            throw new BusinessException("读取版本内容失败：" + e.getMessage());
        }
    }

    @PostMapping("/{documentId}/versions/{versionNumber}/restore")
    @AuditLog(module = "VERSION", operation = "恢复版本")
    public Result<DocumentVersionDTO> restoreVersion(
            @PathVariable String documentId,
            @PathVariable Integer versionNumber) {
        CurrentUser currentUser = CurrentUser.get();
        DocumentVersionDTO version = versionService.restoreVersion(currentUser.getTenantId(), currentUser.getUserId(), documentId, versionNumber);
        return Result.success(version);
    }

    @DeleteMapping("/versions/{versionId}")
    @AuditLog(module = "VERSION", operation = "删除版本")
    public Result<Void> deleteVersion(@PathVariable String versionId) {
        CurrentUser currentUser = CurrentUser.get();
        versionService.deleteVersion(currentUser.getTenantId(), versionId);
        return Result.success();
    }

    @PostMapping("/{documentId}/branches")
    @AuditLog(module = "BRANCH", operation = "创建分支")
    public Result<DocumentBranchDTO> createBranch(
            @PathVariable String documentId,
            @Valid @RequestBody BranchCreateDTO createDTO) {
        CurrentUser currentUser = CurrentUser.get();
        DocumentBranchDTO branch = branchService.createBranch(
                currentUser.getTenantId(), currentUser.getUserId(), documentId, createDTO);
        return Result.success(branch);
    }

    @GetMapping("/{documentId}/branches")
    public Result<List<DocumentBranchDTO>> getBranches(@PathVariable String documentId) {
        CurrentUser currentUser = CurrentUser.get();
        List<DocumentBranchDTO> branches = branchService.getBranchesByDocumentId(currentUser.getTenantId(), documentId);
        return Result.success(branches);
    }

    @GetMapping("/{documentId}/branches/default")
    public Result<DocumentBranchDTO> getDefaultBranch(@PathVariable String documentId) {
        CurrentUser currentUser = CurrentUser.get();
        DocumentBranchDTO branch = branchService.getDefaultBranch(currentUser.getTenantId(), documentId);
        return Result.success(branch);
    }

    @PostMapping("/{documentId}/branches/{branchId}/switch")
    @AuditLog(module = "BRANCH", operation = "切换分支")
    public Result<DocumentBranchDTO> switchBranch(
            @PathVariable String documentId,
            @PathVariable String branchId) {
        CurrentUser currentUser = CurrentUser.get();
        DocumentBranchDTO branch = branchService.switchBranch(
                currentUser.getTenantId(), currentUser.getUserId(), documentId, branchId);
        return Result.success(branch);
    }

    @PostMapping("/{documentId}/branches/merge")
    @AuditLog(module = "BRANCH", operation = "合并分支")
    public Result<DocumentBranchDTO> mergeBranch(
            @PathVariable String documentId,
            @RequestBody BranchMergeDTO mergeDTO) {
        CurrentUser currentUser = CurrentUser.get();
        DocumentBranchDTO branch = branchService.mergeBranch(
                currentUser.getTenantId(), currentUser.getUserId(), documentId, mergeDTO);
        return Result.success(branch);
    }

    @PutMapping("/{documentId}/branches/{branchId}")
    public Result<DocumentBranchDTO> updateBranch(
            @PathVariable String documentId,
            @PathVariable String branchId,
            @RequestParam String name,
            @RequestParam(required = false) String description) {
        CurrentUser currentUser = CurrentUser.get();
        DocumentBranchDTO branch = branchService.updateBranch(
                currentUser.getTenantId(), branchId, name, description);
        return Result.success(branch);
    }

    @DeleteMapping("/{documentId}/branches/{branchId}")
    @AuditLog(module = "BRANCH", operation = "删除分支")
    public Result<Void> deleteBranch(
            @PathVariable String documentId,
            @PathVariable String branchId) {
        CurrentUser currentUser = CurrentUser.get();
        branchService.deleteBranch(currentUser.getTenantId(), branchId);
        return Result.success();
    }

    @PostMapping("/{documentId}/chunks")
    public Result<ChunkUploadResponse> uploadChunk(
            @PathVariable String documentId,
            @RequestParam("chunkData") byte[] chunkData,
            @RequestParam String fileName,
            @RequestParam Long fileSize,
            @RequestParam Integer totalChunks,
            @RequestParam Integer chunkIndex,
            @RequestParam Integer chunkSize,
            @RequestParam(required = false) String uploadId,
            @RequestParam(required = false) String fileHash,
            @RequestParam(required = false) String mimeType,
            @RequestParam(required = false) String changeLog) {
        CurrentUser currentUser = CurrentUser.get();
        ChunkUploadDTO chunkDTO = new ChunkUploadDTO();
        chunkDTO.setUploadId(uploadId);
        chunkDTO.setDocumentId(documentId);
        chunkDTO.setFileName(fileName);
        chunkDTO.setFileHash(fileHash);
        chunkDTO.setFileSize(fileSize);
        chunkDTO.setTotalChunks(totalChunks);
        chunkDTO.setChunkIndex(chunkIndex);
        chunkDTO.setChunkSize(chunkSize);
        chunkDTO.setChunkData(chunkData);
        chunkDTO.setMimeType(mimeType);
        chunkDTO.setChangeLog(changeLog);

        ChunkUploadResponse response = chunkUploadService.uploadChunk(
                currentUser.getTenantId(), currentUser.getUserId(), chunkDTO);
        return Result.success(response);
    }

    @GetMapping("/{documentId}/chunks/check")
    public Result<ChunkUploadResponse> checkChunk(
            @PathVariable String documentId,
            @RequestParam String uploadId,
            @RequestParam Integer chunkIndex) {
        CurrentUser currentUser = CurrentUser.get();
        ChunkUploadResponse response = chunkUploadService.checkChunk(
                currentUser.getTenantId(), uploadId, chunkIndex);
        return Result.success(response);
    }

    @PostMapping("/{documentId}/chunks/merge")
    public Result<ChunkUploadResponse> mergeChunks(
            @PathVariable String documentId,
            @RequestParam String uploadId) {
        CurrentUser currentUser = CurrentUser.get();
        ChunkUploadResponse response = chunkUploadService.mergeChunks(
                currentUser.getTenantId(), currentUser.getUserId(), uploadId);
        return Result.success(response);
    }

    @PostMapping("/{documentId}/chunks/cancel")
    public Result<ChunkUploadResponse> cancelUpload(
            @PathVariable String documentId,
            @RequestParam String uploadId) {
        CurrentUser currentUser = CurrentUser.get();
        ChunkUploadResponse response = chunkUploadService.cancelUpload(
                currentUser.getTenantId(), uploadId);
        return Result.success(response);
    }

    private String generateFilePath(String tenantId, String documentId, String fileName) {
        String extension = "";
        int dotIndex = fileName.lastIndexOf('.');
        if (dotIndex > 0) {
            extension = fileName.substring(dotIndex);
        }
        return tenantId + "/" + documentId + "/" + UUID.randomUUID().toString() + extension;
    }
}
