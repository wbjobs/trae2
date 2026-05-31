package com.research.asset.repository;

import com.research.asset.entity.ApprovalLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ApprovalLogRepository extends JpaRepository<ApprovalLog, UUID> {

    List<ApprovalLog> findByInstanceIdOrderByCreatedAtAsc(UUID instanceId);

    List<ApprovalLog> findByInstanceIdOrderByCreatedAtDesc(UUID instanceId);

    List<ApprovalLog> findByApproverIdOrderByCreatedAtDesc(UUID approverId);
}
