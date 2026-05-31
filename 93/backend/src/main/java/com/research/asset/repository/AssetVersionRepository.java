package com.research.asset.repository;

import com.research.asset.entity.AssetVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AssetVersionRepository extends JpaRepository<AssetVersion, UUID> {

    List<AssetVersion> findByAssetIdOrderByVersionNumberDesc(UUID assetId);

    Optional<AssetVersion> findByAssetIdAndVersionNumber(UUID assetId, Integer versionNumber);

    int countByAssetId(UUID assetId);

    Optional<AssetVersion> findFirstByAssetIdOrderByVersionNumberDesc(UUID assetId);
}
