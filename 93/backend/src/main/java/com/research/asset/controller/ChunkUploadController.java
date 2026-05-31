package com.research.asset.controller;

import com.research.asset.config.OssConfig;
import com.research.asset.dto.Result;
import com.research.asset.dto.UploadChunkDTO;
import com.research.asset.dto.UploadInitDTO;
import com.research.asset.dto.UploadResponse;
import com.research.asset.dto.UploadTaskDTO;
import com.research.asset.service.ChunkUploadService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/upload")
@CrossOrigin
@RequiredArgsConstructor
public class ChunkUploadController {

    private final ChunkUploadService chunkUploadService;
    private final OssConfig ossConfig;

    @PostMapping("/init")
    public Result<UploadTaskDTO> initUpload(@Valid @RequestBody UploadInitDTO dto,
                                            @RequestHeader(required = false) UUID userId) {
        if (userId == null) {
            userId = UUID.randomUUID();
        }
        UploadTaskDTO task = chunkUploadService.initUpload(dto, userId);
        return Result.success(task);
    }

    @PostMapping("/chunk")
    public Result<UploadResponse> uploadChunk(@RequestParam MultipartFile file,
                                              @Valid UploadChunkDTO dto) {
        UploadResponse response = chunkUploadService.uploadChunk(file, dto);
        return Result.success(response);
    }

    @GetMapping("/check")
    public Result<Boolean> checkChunk(@Valid UploadChunkDTO dto) {
        boolean exists = chunkUploadService.checkChunk(dto);
        return Result.success(exists);
    }

    @PostMapping("/merge")
    public Result<Map<String, String>> mergeChunks(@RequestParam String uploadId) {
        String ossKey = chunkUploadService.mergeChunks(uploadId);
        String url = ossConfig.getUrlPrefix() + "/" + ossKey;

        Map<String, String> result = new HashMap<>();
        result.put("ossKey", ossKey);
        result.put("url", url);
        return Result.success(result);
    }

    @PostMapping("/pause/{uploadId}")
    public Result<Void> pauseUpload(@PathVariable String uploadId) {
        chunkUploadService.pauseUpload(uploadId);
        return Result.success();
    }

    @PostMapping("/resume/{uploadId}")
    public Result<UploadTaskDTO> resumeUpload(@PathVariable String uploadId) {
        UploadTaskDTO task = chunkUploadService.resumeUpload(uploadId);
        return Result.success(task);
    }

    @GetMapping("/{uploadId}")
    public Result<UploadTaskDTO> getUploadTask(@PathVariable String uploadId) {
        UploadTaskDTO task = chunkUploadService.getUploadTask(uploadId);
        return Result.success(task);
    }

    @GetMapping("/user/tasks")
    public Result<List<UploadTaskDTO>> getUserUploadTasks(@RequestHeader(required = false) UUID userId) {
        if (userId == null) {
            userId = UUID.randomUUID();
        }
        List<UploadTaskDTO> tasks = chunkUploadService.getUserUploadTasks(userId);
        return Result.success(tasks);
    }

    @DeleteMapping("/{uploadId}")
    public Result<Void> cancelUpload(@PathVariable String uploadId) {
        chunkUploadService.cancelUpload(uploadId);
        return Result.success();
    }
}
