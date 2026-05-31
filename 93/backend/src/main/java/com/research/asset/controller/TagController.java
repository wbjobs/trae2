package com.research.asset.controller;

import com.research.asset.dto.Result;
import com.research.asset.dto.TagAutoClassifyDTO;
import com.research.asset.dto.TagClassifyDTO;
import com.research.asset.dto.TagDTO;
import com.research.asset.service.TagService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/tags")
@CrossOrigin
@RequiredArgsConstructor
public class TagController {

    private final TagService tagService;

    @GetMapping
    public Result<List<TagDTO>> getAllTags() {
        return Result.success(tagService.getAllTags());
    }

    @GetMapping("/hot")
    public Result<List<TagDTO>> getHotTags(@RequestParam(defaultValue = "10") int limit) {
        return Result.success(tagService.getHotTags(limit));
    }

    @PostMapping
    public Result<TagDTO> createTag(@Valid @RequestBody TagDTO dto) {
        return Result.success(tagService.createTag(dto));
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteTag(@PathVariable UUID id) {
        tagService.deleteTag(id);
        return Result.success();
    }

    @PostMapping("/classify")
    public Result<Void> classifyAsset(@RequestBody TagClassifyDTO dto) {
        tagService.classifyAsset(dto.getAssetId(), dto.getTagIds());
        return Result.success();
    }

    @PostMapping("/auto-classify/{assetId}")
    public Result<TagAutoClassifyDTO> autoClassifyAsset(@PathVariable UUID assetId) {
        return Result.success(tagService.autoClassifyAsset(assetId));
    }

    @GetMapping("/asset/{assetId}")
    public Result<List<TagDTO>> getAssetTags(@PathVariable UUID assetId) {
        return Result.success(tagService.getAssetTags(assetId));
    }
}
