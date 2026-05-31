package com.research.asset.repository;

import com.research.asset.entity.UploadChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UploadChunkRepository extends JpaRepository<UploadChunk, java.util.UUID> {

    List<UploadChunk> findByUploadIdOrderByChunkNumberAsc(String uploadId);

    int countByUploadId(String uploadId);

    @Modifying
    void deleteByUploadId(String uploadId);
}
