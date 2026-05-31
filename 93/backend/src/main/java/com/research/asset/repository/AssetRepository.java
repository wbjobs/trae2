package com.research.asset.repository;

import com.research.asset.entity.Asset;
import com.research.asset.enums.AssetStatus;
import com.research.asset.enums.AssetType;
import com.research.asset.enums.ClassificationLevel;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AssetRepository extends JpaRepository<Asset, UUID> {

    Optional<Asset> findByAssetCode(String assetCode);

    Page<Asset> findByTitleContainingAndAssetTypeAndStatusAndClassificationLevelAndDepartmentAndCreatedAtBetween(
            String title, AssetType assetType, AssetStatus status, ClassificationLevel classificationLevel,
            String department, LocalDateTime startTime, LocalDateTime endTime, Pageable pageable);

    List<Asset> findByCreatedBy(UUID createdBy);

    List<Asset> findByStatus(AssetStatus status);

    long countByStatus(AssetStatus status);

    long countByAssetType(AssetType assetType);

    boolean existsByAssetCode(String assetCode);

    List<Asset> findByTagsId(UUID tagId);

    Page<Asset> findByTagsId(UUID tagId, Pageable pageable);
}
