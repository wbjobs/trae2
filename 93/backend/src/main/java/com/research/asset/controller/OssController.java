package com.research.asset.controller;

import com.research.asset.config.OssConfig;
import com.research.asset.dto.Result;
import com.research.asset.service.FileCleanupService;
import com.research.asset.service.OssService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/oss")
@CrossOrigin
@RequiredArgsConstructor
public class OssController {

    private final OssService ossService;
    private final OssConfig ossConfig;
    private final FileCleanupService fileCleanupService;

    @PostMapping("/upload")
    public Result<Map<String, String>> upload(@RequestParam MultipartFile file,
                                              @RequestHeader(required = false) UUID userId,
                                              @RequestHeader(required = false, defaultValue = "default") String session) {
        String ossKey = ossService.uploadFile(file);
        String url = ossConfig.getUrlPrefix() + "/" + ossKey;

        fileCleanupService.recordTempFile(
                ossKey,
                ossConfig.getBucketName(),
                file.getOriginalFilename(),
                file.getSize(),
                file.getContentType(),
                userId,
                session
        );

        Map<String, String> result = new HashMap<>();
        result.put("ossKey", ossKey);
        result.put("url", url);
        return Result.success(result);
    }

    @PostMapping("/cleanup/session")
    public Result<Long> cleanupSession(@RequestHeader(required = false, defaultValue = "default") String session) {
        fileCleanupService.deleteSessionFiles(session);
        return Result.success();
    }

    @GetMapping("/cleanup/count")
    public Result<Long> getOrphanFileCount() {
        return Result.success(fileCleanupService.getOrphanFileCount());
    }

    @GetMapping("/download/{ossKey}")
    public ResponseEntity<InputStreamResource> download(@PathVariable String ossKey) {
        InputStream inputStream = ossService.downloadFile(ossKey);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        headers.setContentDispositionFormData("attachment", ossKey);
        return ResponseEntity.ok()
                .headers(headers)
                .body(new InputStreamResource(inputStream));
    }

    @GetMapping("/preview/{ossKey}")
    public Result<String> getPreviewUrl(@PathVariable String ossKey) {
        return Result.success(ossService.getPreviewUrl(ossKey));
    }

    @DeleteMapping("/{ossKey}")
    public Result<Void> delete(@PathVariable String ossKey) {
        ossService.deleteFile(ossKey);
        return Result.success();
    }
}
