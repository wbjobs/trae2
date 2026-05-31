package com.research.asset.repository;

import com.research.asset.entity.OperationLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface OperationLogRepository extends JpaRepository<OperationLog, UUID> {

    Page<OperationLog> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    Page<OperationLog> findByAssetIdOrderByCreatedAtDesc(UUID assetId, Pageable pageable);

    List<OperationLog> findTop10ByOrderByCreatedAtDesc();
}
