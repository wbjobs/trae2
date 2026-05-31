package com.gis3d.repository;

import com.gis3d.entity.VectorData;
import org.locationtech.jts.geom.Geometry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Stream;

@Repository
public interface VectorDataRepository extends JpaRepository<VectorData, Long> {

    List<VectorData> findByLayerName(String layerName);

    Page<VectorData> findByLayerName(String layerName, Pageable pageable);

    List<VectorData> findByType(String type);

    Page<VectorData> findByType(String type, Pageable pageable);

    @Query(value = "SELECT v FROM VectorData v WHERE ST_Intersects(v.geom, :bbox) = true")
    List<VectorData> findByBbox(@Param("bbox") Geometry bbox);

    @Query(value = "SELECT v FROM VectorData v WHERE ST_Intersects(v.geom, :bbox) = true")
    Page<VectorData> findByBbox(@Param("bbox") Geometry bbox, Pageable pageable);

    @Query(value = "SELECT v FROM VectorData v WHERE ST_DWithin(v.geom, :point, :distance) = true")
    List<VectorData> findWithinDistance(@Param("point") Geometry point, @Param("distance") double distance);

    @Query(value = "SELECT v FROM VectorData v WHERE ST_DWithin(v.geom, :point, :distance) = true")
    Page<VectorData> findWithinDistance(@Param("point") Geometry point, @Param("distance") double distance, Pageable pageable);

    @Query(value = "SELECT DISTINCT v.layerName FROM VectorData v")
    List<String> findAllLayerNames();

    @Query(value = "SELECT ST_AsGeoJSON(v.geom) FROM VectorData v WHERE v.id = :id")
    String getGeoJsonById(@Param("id") Long id);

    @Query(value = "SELECT COUNT(v) FROM VectorData v WHERE ST_Intersects(v.geom, :bbox) = true")
    long countByBbox(@Param("bbox") Geometry bbox);

    @Query(value = "SELECT COUNT(v) FROM VectorData v WHERE ST_DWithin(v.geom, :point, :distance) = true")
    long countWithinDistance(@Param("point") Geometry point, @Param("distance") double distance);

    long countByLayerName(String layerName);

    long countByType(String type);

    @Transactional(readOnly = true)
    @Query(value = "SELECT v FROM VectorData v")
    Stream<VectorData> streamAll();

    @Transactional(readOnly = true)
    @Query(value = "SELECT v FROM VectorData v WHERE v.layerName = :layerName")
    Stream<VectorData> streamByLayerName(@Param("layerName") String layerName);

    @Transactional(readOnly = true)
    @Query(value = "SELECT v FROM VectorData v WHERE ST_Intersects(v.geom, :bbox) = true")
    Stream<VectorData> streamByBbox(@Param("bbox") Geometry bbox);

    @Query(value = "SELECT v FROM VectorData v WHERE (:layerName IS NULL OR v.layerName = :layerName) " +
           "AND (:type IS NULL OR v.type = :type) " +
           "AND (:bbox IS NULL OR ST_Intersects(v.geom, :bbox) = true)")
    Page<VectorData> findWithFilters(
            @Param("layerName") String layerName,
            @Param("type") String type,
            @Param("bbox") Geometry bbox,
            Pageable pageable);

    @Query(value = "SELECT COUNT(v) FROM VectorData v WHERE (:layerName IS NULL OR v.layerName = :layerName) " +
           "AND (:type IS NULL OR v.type = :type) " +
           "AND (:bbox IS NULL OR ST_Intersects(v.geom, :bbox) = true)")
    long countWithFilters(
            @Param("layerName") String layerName,
            @Param("type") String type,
            @Param("bbox") Geometry bbox);
}
