package com.research.asset.repository;

import com.research.asset.entity.AssetFile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AssetFileRepository extends JpaRepository<AssetFile, UUID> {

    List<AssetFile> findByAssetId(UUID assetId);

    List<AssetFile> findByAssetIdOrderByUploadedAtDesc(UUID assetId);

    Optional<AssetFile> findByOssKey(String ossKey);

    void deleteByAssetId(UUID assetId);

    List<AssetFile> findByIsTemporaryTrueAndExpiresAtBefore(java.time.LocalDateTime dateTime);

    void deleteByIsTemporaryTrueAndExpiresAtBefore(java.time.LocalDateTime dateTime);
}
