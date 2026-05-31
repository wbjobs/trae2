package com.research.asset.service;

import com.research.asset.dto.VersionCreateDTO;
import com.research.asset.dto.VersionDTO;
import com.research.asset.entity.Asset;
import com.research.asset.entity.AssetVersion;
import com.research.asset.entity.User;
import com.research.asset.repository.AssetRepository;
import com.research.asset.repository.AssetVersionRepository;
import com.research.asset.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class VersionService {

    private final AssetVersionRepository assetVersionRepository;
    private final AssetRepository assetRepository;
    private final UserRepository userRepository;

    @Transactional
    public VersionDTO createVersion(VersionCreateDTO dto, UUID userId) {
        Asset asset = assetRepository.findById(dto.getAssetId())
                .orElseThrow(() -> new EntityNotFoundException("资产不存在"));
        Integer maxVersion = assetVersionRepository.findMaxVersionNumberByAssetId(dto.getAssetId());
        int nextVersion = maxVersion != null ? maxVersion + 1 : 1;
        AssetVersion version = new AssetVersion();
        version.setAsset(asset);
        version.setVersionNumber(nextVersion);
        version.setVersionTag(dto.getVersionTag());
        version.setChangeDescription(dto.getChangeDescription());
        version.setCreatedBy(userId);
        version = assetVersionRepository.save(version);
        return convertToDTO(version);
    }

    public List<VersionDTO> getVersionsByAssetId(UUID assetId) {
        List<AssetVersion> versions = assetVersionRepository.findByAssetIdOrderByVersionNumberDesc(assetId);
        return versions.stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    public VersionDTO getLatestVersion(UUID assetId) {
        AssetVersion version = assetVersionRepository.findTopByAssetIdOrderByVersionNumberDesc(assetId)
                .orElseThrow(() -> new EntityNotFoundException("版本不存在"));
        return convertToDTO(version);
    }

    public VersionDTO getVersionById(UUID id) {
        AssetVersion version = assetVersionRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("版本不存在"));
        return convertToDTO(version);
    }

    public Map<String, Object> compareVersions(UUID assetId, Integer v1, Integer v2) {
        AssetVersion version1 = assetVersionRepository.findByAssetIdAndVersionNumber(assetId, v1)
                .orElseThrow(() -> new EntityNotFoundException("版本" + v1 + "不存在"));
        AssetVersion version2 = assetVersionRepository.findByAssetIdAndVersionNumber(assetId, v2)
                .orElseThrow(() -> new EntityNotFoundException("版本" + v2 + "不存在"));
        Map<String, Object> result = new HashMap<>();
        result.put("version1", convertToDTO(version1));
        result.put("version2", convertToDTO(version2));
        Map<String, String> differences = new HashMap<>();
        if (!version1.getChangeDescription().equals(version2.getChangeDescription())) {
            differences.put("changeDescription", version1.getChangeDescription() + " -> " + version2.getChangeDescription());
        }
        if (!version1.getVersionTag().equals(version2.getVersionTag())) {
            differences.put("versionTag", version1.getVersionTag() + " -> " + version2.getVersionTag());
        }
        result.put("differences", differences);
        return result;
    }

    private VersionDTO convertToDTO(AssetVersion version) {
        VersionDTO dto = new VersionDTO();
        dto.setId(version.getId());
        dto.setAssetId(version.getAsset().getId());
        dto.setVersionNumber(version.getVersionNumber());
        dto.setVersionTag(version.getVersionTag());
        dto.setChangeDescription(version.getChangeDescription());
        dto.setCreatedAt(version.getCreatedAt());
        User user = userRepository.findById(version.getCreatedBy()).orElse(null);
        if (user != null) {
            dto.setCreatedByName(user.getRealName());
        }
        return dto;
    }
}
