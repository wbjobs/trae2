package com.research.asset.repository;

import com.research.asset.entity.UploadTask;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UploadTaskRepository extends JpaRepository<UploadTask, UUID> {

    Optional<UploadTask> findByUploadId(String uploadId);

    List<UploadTask> findByUserIdAndStatus(UUID userId, String status);

    List<UploadTask> findByStatusAndExpiredAtBefore(String status, LocalDateTime time);

    @Modifying
    void deleteByUploadId(String uploadId);
}
