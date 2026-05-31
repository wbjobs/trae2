package com.mine.terrain.entity;

import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.locationtech.jts.geom.Polygon;

import javax.persistence.*;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "mining_area", indexes = {
        @Index(name = "idx_mining_area_mine_id", columnList = "mineId"),
        @Index(name = "idx_mining_area_geom", columnList = "geometry")
})
public class MiningArea {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String mineId;

    @Column(nullable = false)
    private String name;

    @Column(length = 1000)
    private String description;

    @Column(name = "geometry", columnDefinition = "geometry(Polygon, 4326)")
    private Polygon geometry;

    @Column(nullable = false)
    private Double area;

    private String status;

    private String operator;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;
}
