package com.mine.terrain.repository;

import com.mine.terrain.entity.MiningArea;
import org.locationtech.jts.geom.Geometry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MiningAreaRepository extends JpaRepository<MiningArea, Long> {

    List<MiningArea> findByMineId(String mineId);

    List<MiningArea> findByMineIdAndStatus(String mineId, String status);

    @Query("SELECT m FROM MiningArea m WHERE m.mineId = :mineId AND " +
           "ST_Intersects(m.geometry, :geometry) = true")
    List<MiningArea> findIntersectingAreas(
            @Param("mineId") String mineId,
            @Param("geometry") Geometry geometry);

    @Query("SELECT m FROM MiningArea m WHERE " +
           "ST_DWithin(m.geometry, :point, :distance) = true")
    List<MiningArea> findAreasWithinDistance(
            @Param("point") Geometry point,
            @Param("distance") Double distance);
}
