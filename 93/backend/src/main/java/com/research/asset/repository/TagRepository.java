package com.research.asset.repository;

import com.research.asset.entity.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TagRepository extends JpaRepository<Tag, UUID> {

    Optional<Tag> findByTagCode(String tagCode);

    List<Tag> findByTagNameContaining(String tagName);

    List<Tag> findByTagType(String tagType);

    List<Tag> findAllByOrderByUseCountDesc();

    List<Tag> findAllByOrderByUseCountDesc(Pageable pageable);
}
