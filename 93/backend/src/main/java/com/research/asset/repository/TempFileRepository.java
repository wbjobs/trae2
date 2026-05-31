package com.research.asset.repository;

import com.research.asset.entity.TempFile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TempFileRepository extends JpaRepository<TempFile, UUID> {

    List<TempFile> findByIsAttachedFalseAndExpiresAtBefore(LocalDateTime dateTime);

    void deleteByIsAttachedFalseAndExpiresAtBefore(LocalDateTime dateTime);

    Optional<TempFile> findByOssKey(String ossKey);

    List<TempFile> findByUploadSession(String uploadSession);

    long countByIsAttachedFalseAndExpiresAtBefore(LocalDateTime dateTime);
}
