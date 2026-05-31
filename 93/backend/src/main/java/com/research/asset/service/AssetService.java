package com.research.asset.service;

import com.research.asset.config.OssConfig;
import com.research.asset.dto.AssetCreateDTO;
import com.research.asset.dto.AssetDTO;
import com.research.asset.dto.AssetFileDTO;
import com.research.asset.dto.AssetQueryDTO;
import com.research.asset.dto.PageResult;
import com.research.asset.entity.Asset;
import com.research.asset.entity.AssetFile;
import com.research.asset.entity.User;
import com.research.asset.enums.AssetStatus;
import com.research.asset.enums.AssetType;
import com.research.asset.enums.ClassificationLevel;
import com.research.asset.repository.AssetFileRepository;
import com.research.asset.repository.AssetRepository;
import com.research.asset.repository.AssetVersionRepository;
import com.research.asset.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AssetService {

    private final AssetRepository assetRepository;
    private final AssetFileRepository assetFileRepository;
    private final AssetVersionRepository assetVersionRepository;
    private final OssService ossService;
    private final UserRepository userRepository;
    private final OssConfig ossConfig;
    private final FileCleanupService fileCleanupService;

    @Transactional
    public AssetDTO createAsset(AssetCreateDTO dto, UUID userId) {
        Asset asset = new Asset();
        asset.setTitle(dto.getTitle());
        asset.setAssetType(AssetType.valueOf(dto.getAssetType()));
        asset.setAbstractText(dto.getAbstractText());
        asset.setKeywords(dto.getKeywords());
        asset.setAuthors(dto.getAuthors());
        asset.setDepartment(dto.getDepartment());
        asset.setProjectId(dto.getProjectId());
        asset.setStatus(AssetStatus.DRAFT);
        asset.setClassificationLevel(ClassificationLevel.valueOf(dto.getClassificationLevel()));
        asset.setCreatedBy(userId);
        asset.setAssetCode(generateAssetCode());
        asset = assetRepository.save(asset);
        return convertToDTO(asset);
    }

    private String generateAssetCode() {
        String dateStr = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String prefix = "ASSET" + dateStr;
        long count = assetRepository.countByAssetCodeStartingWith(prefix);
        return prefix + String.format("%06d", count + 1);
    }

    public AssetDTO getAssetById(UUID id) {
        Asset asset = assetRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("资产不存在"));
        return convertToDTO(asset);
    }

    public PageResult<AssetDTO> getAssetList(AssetQueryDTO dto) {
        Pageable pageable = PageRequest.of(
                dto.getPageNum() != null ? dto.getPageNum() - 1 : 0,
                dto.getPageSize() != null ? dto.getPageSize() : 10,
                Sort.by(Sort.Direction.DESC, "createdAt")
        );
        AssetType assetType = dto.getAssetType() != null ? AssetType.valueOf(dto.getAssetType()) : null;
        AssetStatus status = dto.getStatus() != null ? AssetStatus.valueOf(dto.getStatus()) : null;
        Page<Asset> page = assetRepository.findByConditions(
                dto.getKeyword(),
                assetType,
                status,
                dto.getDepartment(),
                dto.getStartDate(),
                dto.getEndDate(),
                pageable
        );
        List<AssetDTO> dtoList = page.getContent().stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
        return PageResult.of(page.getTotal(), dto.getPageNum(), dto.getPageSize(), dtoList);
    }

    @Transactional
    public AssetDTO updateAsset(UUID id, AssetCreateDTO dto) {
        Asset asset = assetRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("资产不存在"));
        asset.setTitle(dto.getTitle());
        asset.setAssetType(AssetType.valueOf(dto.getAssetType()));
        asset.setAbstractText(dto.getAbstractText());
        asset.setKeywords(dto.getKeywords());
        asset.setAuthors(dto.getAuthors());
        asset.setDepartment(dto.getDepartment());
        asset.setProjectId(dto.getProjectId());
        asset.setClassificationLevel(ClassificationLevel.valueOf(dto.getClassificationLevel()));
        asset = assetRepository.save(asset);
        return convertToDTO(asset);
    }

    @Transactional
    public void deleteAsset(UUID id) {
        Asset asset = assetRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("资产不存在"));
        List<AssetFile> files = assetFileRepository.findByAssetId(id);
        for (AssetFile file : files) {
            ossService.deleteFile(file.getOssKey());
        }
        assetRepository.delete(asset);
    }

    @Transactional
    public AssetDTO archiveAsset(UUID id) {
        Asset asset = assetRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("资产不存在"));
        asset.setStatus(AssetStatus.APPROVING);
        asset = assetRepository.save(asset);
        return convertToDTO(asset);
    }

    @Transactional
    public AssetDTO confirmArchive(UUID id) {
        Asset asset = assetRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("资产不存在"));
        asset.setStatus(AssetStatus.ARCHIVED);
        asset = assetRepository.save(asset);
        return convertToDTO(asset);
    }

    public List<AssetFileDTO> getAssetFiles(UUID assetId) {
        List<AssetFile> files = assetFileRepository.findByAssetId(assetId);
        return files.stream()
                .map(this::convertToFileDTO)
                .collect(Collectors.toList());
    }

    @Transactional
    public AssetFileDTO attachFile(UUID assetId, MultipartFile file, UUID userId) {
        Asset asset = assetRepository.findById(assetId)
                .orElseThrow(() -> new EntityNotFoundException("资产不存在"));
        String ossKey = ossService.uploadFile(file);
        AssetFile assetFile = new AssetFile();
        assetFile.setAsset(asset);
        assetFile.setFileName(file.getOriginalFilename());
        assetFile.setFileSize(file.getSize());
        assetFile.setFileType(file.getContentType());
        assetFile.setOssKey(ossKey);
        assetFile.setOssBucket(ossConfig.getBucketName());
        assetFile.setUploadedBy(userId);
        assetFile.setIsTemporary(false);
        assetFile = assetFileRepository.save(assetFile);

        fileCleanupService.markFileAttached(ossKey);

        return convertToFileDTO(assetFile);
    }

    @Transactional
    public void removeFile(UUID fileId) {
        AssetFile file = assetFileRepository.findById(fileId)
                .orElseThrow(() -> new EntityNotFoundException("文件不存在"));
        ossService.deleteFile(file.getOssKey());
        assetFileRepository.delete(file);
    }

    public Map<String, Object> getStatistics() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("total", assetRepository.count());
        Map<String, Long> statusStats = new HashMap<>();
        List<Object[]> statusGroup = assetRepository.countByStatusGroup();
        for (Object[] row : statusGroup) {
            statusStats.put(row[0].toString(), (Long) row[1]);
        }
        stats.put("status", statusStats);
        Map<String, Long> typeStats = new HashMap<>();
        List<Object[]> typeGroup = assetRepository.countByAssetTypeGroup();
        for (Object[] row : typeGroup) {
            typeStats.put(row[0].toString(), (Long) row[1]);
        }
        stats.put("type", typeStats);
        return stats;
    }

    private AssetDTO convertToDTO(Asset asset) {
        AssetDTO dto = new AssetDTO();
        dto.setId(asset.getId());
        dto.setAssetCode(asset.getAssetCode());
        dto.setTitle(asset.getTitle());
        dto.setAssetType(asset.getAssetType().name());
        dto.setAbstractText(asset.getAbstractText());
        dto.setKeywords(asset.getKeywords());
        dto.setAuthors(asset.getAuthors());
        dto.setDepartment(asset.getDepartment());
        dto.setProjectId(asset.getProjectId());
        dto.setStatus(asset.getStatus().name());
        dto.setClassificationLevel(asset.getClassificationLevel().name());
        dto.setCreatedBy(asset.getCreatedBy());
        dto.setCreatedAt(asset.getCreatedAt());
        dto.setUpdatedAt(asset.getUpdatedAt());
        User user = userRepository.findById(asset.getCreatedBy()).orElse(null);
        if (user != null) {
            dto.setCreatedByName(user.getRealName());
        }
        return dto;
    }

    private AssetFileDTO convertToFileDTO(AssetFile file) {
        AssetFileDTO dto = new AssetFileDTO();
        dto.setId(file.getId());
        dto.setFileName(file.getFileName());
        dto.setFileSize(file.getFileSize());
        dto.setFileType(file.getFileType());
        dto.setOssKey(file.getOssKey());
        dto.setDownloadUrl(ossService.getPreviewUrl(file.getOssKey()));
        dto.setUploadedAt(file.getUploadedAt());
        User user = userRepository.findById(file.getUploadedBy()).orElse(null);
        if (user != null) {
            dto.setUploadedByName(user.getRealName());
        }
        return dto;
    }
}
