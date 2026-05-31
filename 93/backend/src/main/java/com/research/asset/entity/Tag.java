package com.research.asset.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Set;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "sys_tag")
public class Tag {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "BINARY(16)")
    private UUID id;

    @Column(nullable = false, unique = true, length = 50)
    private String tagName;

    @Column(nullable = false, unique = true, length = 50)
    private String tagCode;

    @Column(nullable = false, length = 20)
    private String tagType;

    @Column(length = 20)
    private String color;

    @Column(length = 255)
    private String description;

    @Column(columnDefinition = "TEXT")
    private String autoClassifyRule;

    @Column(nullable = false)
    private Integer useCount = 0;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @ManyToMany(mappedBy = "tags")
    private Set<Asset> assets;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (useCount == null) {
            useCount = 0;
        }
    }
}
