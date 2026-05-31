package com.doccollab.repository;

import com.doccollab.entity.OrphanedFile;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface OrphanedFileRepository extends MongoRepository<OrphanedFile, String> {

    List<OrphanedFile> findByStatusAndCreatedAtBefore(String status, LocalDateTime before);

    List<OrphanedFile> findByStatus(String status);
}
