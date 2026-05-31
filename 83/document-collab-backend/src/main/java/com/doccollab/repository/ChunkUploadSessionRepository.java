package com.doccollab.repository;

import com.doccollab.entity.ChunkUploadSession;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface ChunkUploadSessionRepository extends MongoRepository<ChunkUploadSession, String> {

    Optional<ChunkUploadSession> findByUploadId(String uploadId);

    Optional<ChunkUploadSession> findByUploadIdAndTenantId(String uploadId, String tenantId);

    Optional<ChunkUploadSession> findByFileHashAndTenantIdAndStatus(String fileHash, String tenantId, String status);

    List<ChunkUploadSession> findByStatusAndCreatedAtBefore(String status, LocalDateTime before);
}
