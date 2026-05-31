package com.research.asset.controller;

import com.research.asset.dto.AssetCreateDTO;
import com.research.asset.dto.AssetDTO;
import com.research.asset.dto.AssetFileDTO;
import com.research.asset.dto.AssetQueryDTO;
import com.research.asset.dto.PageResult;
import com.research.asset.dto.Result;
import com.research.asset.service.AssetService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/assets")
@CrossOrigin
@RequiredArgsConstructor
public class AssetController {

    private final AssetService assetService;

    @GetMapping
    public Result<PageResult<AssetDTO>> getAssetList(AssetQueryDTO dto) {
        return Result.success(assetService.getAssetList(dto));
    }

    @GetMapping("/{id}")
    public Result<AssetDTO> getAssetById(@PathVariable UUID id) {
        return Result.success(assetService.getAssetById(id));
    }

    @PostMapping
    public Result<AssetDTO> createAsset(@Valid @RequestBody AssetCreateDTO dto, @RequestHeader UUID userId) {
        return Result.success(assetService.createAsset(dto, userId));
    }

    @PutMapping("/{id}")
    public Result<AssetDTO> updateAsset(@PathVariable UUID id, @Valid @RequestBody AssetCreateDTO dto) {
        return Result.success(assetService.updateAsset(id, dto));
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteAsset(@PathVariable UUID id) {
        assetService.deleteAsset(id);
        return Result.success();
    }

    @PostMapping("/{id}/archive")
    public Result<AssetDTO> archiveAsset(@PathVariable UUID id) {
        return Result.success(assetService.archiveAsset(id));
    }

    @GetMapping("/{id}/files")
    public Result<List<AssetFileDTO>> getAssetFiles(@PathVariable UUID id) {
        return Result.success(assetService.getAssetFiles(id));
    }

    @PostMapping("/{id}/files")
    public Result<AssetFileDTO> attachFile(@PathVariable UUID id, @RequestParam MultipartFile file, @RequestHeader UUID userId) {
        return Result.success(assetService.attachFile(id, file, userId));
    }

    @DeleteMapping("/files/{fileId}")
    public Result<Void> removeFile(@PathVariable UUID fileId) {
        assetService.removeFile(fileId);
        return Result.success();
    }

    @GetMapping("/statistics")
    public Result<Map<String, Object>> getStatistics() {
        return Result.success(assetService.getStatistics());
    }
}
