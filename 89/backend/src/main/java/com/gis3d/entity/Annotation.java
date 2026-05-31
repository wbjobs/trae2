package com.gis3d.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.locationtech.jts.geom.Point;

import java.time.LocalDateTime;
import java.util.Map;

@Data
@Entity
@Table(name = "annotations")
public class Annotation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(length = 50)
    private String type;

    @Column(name = "geom", columnDefinition = "Geometry(Point, 4326)")
    private Point geom;

    @Column(length = 200)
    private String label;

    @Column(name = "properties", columnDefinition = "json")
    @Convert(converter = MapConverter.class)
    private Map<String, Object> properties;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (geom != null && geom.getSRID() == 0) {
            geom.setSRID(4326);
        }
    }
}
