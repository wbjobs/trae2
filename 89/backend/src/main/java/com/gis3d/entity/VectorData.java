package com.gis3d.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.locationtech.jts.geom.Geometry;

import java.time.LocalDateTime;
import java.util.Map;

@Data
@Entity
@Table(name = "vector_data")
public class VectorData {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 50)
    private String type;

    @Column(name = "geom", columnDefinition = "Geometry")
    private Geometry geom;

    @Column(name = "srid")
    private Integer srid = 4326;

    @Column(name = "properties", columnDefinition = "json")
    @Convert(converter = MapConverter.class)
    private Map<String, Object> properties;

    @Column(name = "layer_name", length = 50)
    private String layerName;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
        if (geom != null && geom.getSRID() == 0) {
            geom.setSRID(srid != null ? srid : 4326);
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
