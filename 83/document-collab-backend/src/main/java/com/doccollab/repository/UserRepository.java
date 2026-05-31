package com.doccollab.repository;

import com.doccollab.entity.User;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends MongoRepository<User, String> {

    Optional<User> findByEmail(String email);

    Optional<User> findByTenantIdAndUsername(String tenantId, String username);

    boolean existsByEmail(String email);

    boolean existsByTenantIdAndUsername(String tenantId, String username);
}
