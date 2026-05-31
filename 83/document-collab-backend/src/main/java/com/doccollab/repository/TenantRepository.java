package com.doccollab.repository;

import com.doccollab.entity.Tenant;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TenantRepository extends MongoRepository<Tenant, String> {

    Optional<Tenant> findByTenantId(String tenantId);

    Optional<Tenant> findByEmail(String email);

    boolean existsByTenantId(String tenantId);

    boolean existsByEmail(String email);
}
