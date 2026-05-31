package com.doccollab.repository;

import com.doccollab.entity.DocumentVersion;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DocumentVersionRepository extends MongoRepository<DocumentVersion, String> {

    Optional<DocumentVersion> findByIdAndTenantId(String id, String tenantId);

    List<DocumentVersion> findByDocumentIdAndTenantIdOrderByVersionNumberDesc(String documentId, String tenantId);

    Optional<DocumentVersion> findByDocumentIdAndVersionNumberAndTenantId(String documentId, Integer versionNumber, String tenantId);

    Optional<DocumentVersion> findFirstByDocumentIdAndTenantIdOrderByVersionNumberDesc(String documentId, String tenantId);

    List<DocumentVersion> findByDocumentIdAndTenantIdAndIsLatestTrue(String documentId, String tenantId);
}
