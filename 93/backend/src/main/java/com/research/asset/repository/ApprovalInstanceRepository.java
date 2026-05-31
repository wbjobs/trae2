package com.research.asset.repository;

import com.research.asset.entity.ApprovalInstance;
import com.research.asset.enums.InstanceStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ApprovalInstanceRepository extends JpaRepository<ApprovalInstance, UUID> {

    Page<ApprovalInstance> findByInitiatorId(UUID initiatorId, Pageable pageable);

    Page<ApprovalInstance> findByInitiatorIdOrderByCreatedAtDesc(UUID initiatorId, Pageable pageable);

    Page<ApprovalInstance> findByStatus(InstanceStatus status, Pageable pageable);

    Optional<ApprovalInstance> findByAssetIdAndStatus(UUID assetId, InstanceStatus status);

    List<ApprovalInstance> findByCurrentNodeOrderAndStatus(Integer nodeOrder, InstanceStatus status);

    long countByStatus(InstanceStatus status);

    @Query("SELECT DISTINCT ai FROM ApprovalInstance ai " +
           "JOIN ApprovalNode an ON ai.currentNodeId = an.id " +
           "WHERE ai.status = 'PENDING' " +
           "AND (an.approverId = :approverId OR an.approverRoleId IN :roleIds)")
    Page<ApprovalInstance> findPendingApprovals(@Param("approverId") UUID approverId,
                                                 @Param("roleIds") List<UUID> roleIds,
                                                 Pageable pageable);
}
