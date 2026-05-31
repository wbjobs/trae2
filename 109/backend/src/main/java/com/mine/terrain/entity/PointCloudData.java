package com.mine.terrain.entity;

import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.locationtech.jts.geom.Point;

import javax.persistence.*;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "point_cloud_data", indexes = {
        @Index(name = "idx_point_cloud_location", columnList = "location"),
        @Index(name = "idx_point_cloud_mine_id", columnList = "mineId")
})
public class PointCloudData {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String mineId;

    @Column(nullable = false)
    private Double x;

    @Column(nullable = false)
    private Double y;

    @Column(nullable = false)
    private Double z;

    @Column(name = "location", columnDefinition = "geometry(Point, 4326)")
    private Point location;

    private Double intensity;

    private Integer r;

    private Integer g;

    private Integer b;

    private String classification;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;
}
