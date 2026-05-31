package com.doccollab.repository;

import com.doccollab.entity.DocumentBranch;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DocumentBranchRepository extends MongoRepository<DocumentBranch, String> {

    Optional<DocumentBranch> findByIdAndTenantId(String id, String tenantId);

    List<DocumentBranch> findByDocumentIdAndTenantId(String documentId, String tenantId);

    Optional<DocumentBranch> findByDocumentIdAndTenantIdAndIsDefaultTrue(String documentId, String tenantId);

    Optional<DocumentBranch> findByDocumentIdAndTenantIdAndName(String documentId, String tenantId, String name);

    boolean existsByDocumentIdAndTenantIdAndName(String documentId, String tenantId, String name);
}
