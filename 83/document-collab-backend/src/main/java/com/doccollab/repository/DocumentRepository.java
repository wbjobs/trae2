package com.doccollab.repository;

import com.doccollab.entity.Document;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DocumentRepository extends MongoRepository<Document, String> {

    Optional<Document> findByIdAndTenantId(String id, String tenantId);

    List<Document> findByTenantId(String tenantId);

    Optional<Document> findByTenantIdAndName(String tenantId, String name);

    boolean existsByTenantIdAndName(String tenantId, String name);
}
