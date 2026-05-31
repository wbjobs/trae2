package com.doccollab.repository;

import com.doccollab.entity.AuditLog;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AuditLogRepository extends MongoRepository<AuditLog, String> {

    List<AuditLog> findByTenantIdAndCreatedAtBetweenOrderByCreatedAtDesc(
            String tenantId, LocalDateTime startTime, LocalDateTime endTime);

    List<AuditLog> findByTenantIdAndModuleAndCreatedAtBetweenOrderByCreatedAtDesc(
            String tenantId, String module, LocalDateTime startTime, LocalDateTime endTime);

    List<AuditLog> findByTenantIdAndUserIdAndCreatedAtBetweenOrderByCreatedAtDesc(
            String tenantId, String userId, LocalDateTime startTime, LocalDateTime endTime);
}
