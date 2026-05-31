package com.mine.terrain.repository;

import com.mine.terrain.entity.PointCloudData;
import org.locationtech.jts.geom.Geometry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PointCloudDataRepository extends JpaRepository<PointCloudData, Long> {

    List<PointCloudData> findByMineId(String mineId);

    Page<PointCloudData> findByMineId(String mineId, Pageable pageable);

    @Query("SELECT p FROM PointCloudData p WHERE p.mineId = :mineId AND " +
           "ST_Within(p.location, :boundary) = true")
    List<PointCloudData> findByMineIdWithinBoundary(
            @Param("mineId") String mineId,
            @Param("boundary") Geometry boundary);

    @Query(value = "SELECT * FROM point_cloud_data WHERE mine_id = :mineId " +
                   "ORDER BY id LIMIT :limit OFFSET :offset", nativeQuery = true)
    List<PointCloudData> findByMineIdWithPagination(
            @Param("mineId") String mineId,
            @Param("limit") Integer limit,
            @Param("offset") Integer offset);

    @Query("SELECT COUNT(p) FROM PointCloudData p WHERE p.mineId = :mineId")
    Long countByMineId(@Param("mineId") String mineId);

    @Query(value = "SELECT * FROM point_cloud_data WHERE mine_id = :mineId " +
                   "AND z >= :minHeight AND z <= :maxHeight " +
                   "ORDER BY id LIMIT :limit OFFSET :offset", nativeQuery = true)
    List<PointCloudData> findByMineIdAndHeightRange(
            @Param("mineId") String mineId,
            @Param("minHeight") Double minHeight,
            @Param("maxHeight") Double maxHeight,
            @Param("limit") Integer limit,
            @Param("offset") Integer offset);

    @Query(value = "SELECT MIN(z), MAX(z) FROM point_cloud_data WHERE mine_id = :mineId", nativeQuery = true)
    List<Object[]> findHeightRangeByMineId(@Param("mineId") String mineId);

    @Query(value = "SELECT * FROM point_cloud_data WHERE mine_id = :mineId " +
                   "AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :radius) " +
                   "ORDER BY id LIMIT :limit OFFSET :offset", nativeQuery = true)
    List<PointCloudData> findByMineIdWithinRadius(
            @Param("mineId") String mineId,
            @Param("lng") Double lng,
            @Param("lat") Double lat,
            @Param("radius") Double radius,
            @Param("limit") Integer limit,
            @Param("offset") Integer offset);

    @Query(value = "SELECT COUNT(*) FROM point_cloud_data WHERE mine_id = :mineId " +
                   "AND z >= :minHeight AND z <= :maxHeight", nativeQuery = true)
    Long countByMineIdAndHeightRange(
            @Param("mineId") String mineId,
            @Param("minHeight") Double minHeight,
            @Param("maxHeight") Double maxHeight);
}
