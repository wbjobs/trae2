package com.research.asset.repository;

import com.research.asset.entity.CirculationRecord;
import com.research.asset.enums.CirculationStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface CirculationRecordRepository extends JpaRepository<CirculationRecord, UUID> {

    Page<CirculationRecord> findByBorrowerId(UUID borrowerId, Pageable pageable);

    Page<CirculationRecord> findByStatus(CirculationStatus status, Pageable pageable);

    List<CirculationRecord> findByAssetIdAndStatus(UUID assetId, CirculationStatus status);

    List<CirculationRecord> findByStatusAndExpectedReturnDateBefore(CirculationStatus status, LocalDate date);

    long countByStatus(CirculationStatus status);

    boolean existsByAssetIdAndStatusIn(UUID assetId, List<CirculationStatus> statuses);

    Optional<CirculationRecord> findTopByAssetIdOrderByCreatedAtDesc(UUID assetId);
}
