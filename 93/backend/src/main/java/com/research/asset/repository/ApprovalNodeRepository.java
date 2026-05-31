package com.research.asset.repository;

import com.research.asset.entity.ApprovalNode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ApprovalNodeRepository extends JpaRepository<ApprovalNode, UUID> {

    List<ApprovalNode> findByFlowIdOrderByNodeOrderAsc(UUID flowId);

    void deleteByFlowId(UUID flowId);
}
