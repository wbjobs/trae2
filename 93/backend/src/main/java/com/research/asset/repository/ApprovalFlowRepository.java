package com.research.asset.repository;

import com.research.asset.entity.ApprovalFlow;
import com.research.asset.enums.FlowType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ApprovalFlowRepository extends JpaRepository<ApprovalFlow, UUID> {

    Optional<ApprovalFlow> findByFlowType(FlowType flowType);

    List<ApprovalFlow> findByFlowTypeOrderByCreatedAtDesc(FlowType flowType);
}
