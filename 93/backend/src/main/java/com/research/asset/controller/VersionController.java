package com.research.asset.controller;

import com.research.asset.dto.Result;
import com.research.asset.dto.VersionCreateDTO;
import com.research.asset.dto.VersionDTO;
import com.research.asset.service.VersionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/versions")
@CrossOrigin
@RequiredArgsConstructor
public class VersionController {

    private final VersionService versionService;

    @PostMapping
    public Result<VersionDTO> createVersion(@Valid @RequestBody VersionCreateDTO dto, @RequestHeader UUID userId) {
        return Result.success(versionService.createVersion(dto, userId));
    }

    @GetMapping("/asset/{assetId}")
    public Result<List<VersionDTO>> getVersionsByAssetId(@PathVariable UUID assetId) {
        return Result.success(versionService.getVersionsByAssetId(assetId));
    }

    @GetMapping("/asset/{assetId}/latest")
    public Result<VersionDTO> getLatestVersion(@PathVariable UUID assetId) {
        return Result.success(versionService.getLatestVersion(assetId));
    }

    @GetMapping("/{id}")
    public Result<VersionDTO> getVersionById(@PathVariable UUID id) {
        return Result.success(versionService.getVersionById(id));
    }

    @GetMapping("/compare")
    public Result<Map<String, Object>> compareVersions(@RequestParam UUID assetId, @RequestParam Integer v1, @RequestParam Integer v2) {
        return Result.success(versionService.compareVersions(assetId, v1, v2));
    }
}
