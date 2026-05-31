package com.mine.terrain.service;

import com.mine.terrain.dto.PointCloudDTO;
import com.mine.terrain.entity.PointCloudData;
import com.mine.terrain.repository.PointCloudDataRepository;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class PointCloudService {

    @Autowired
    private PointCloudDataRepository pointCloudDataRepository;

    @Autowired
    private GeometryFactory geometryFactory;

    private static final int DEFAULT_PAGE_SIZE = 10000;
    private static final int MAX_PAGE_SIZE = 50000;

    public Map<String, Object> getPointCloudData(String mineId, Integer limit, Integer offset) {
        Map<String, Object> result = new HashMap<>();
        List<PointCloudData> data;

        Long total = pointCloudDataRepository.countByMineId(mineId);
        result.put("total", total);

        int pageSize = limit != null ? Math.min(limit, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
        int pageOffset = offset != null ? offset : 0;

        result.put("limit", pageSize);
        result.put("offset", pageOffset);
        result.put("hasMore", (pageOffset + pageSize) < total);

        data = pointCloudDataRepository.findByMineIdWithPagination(mineId, pageSize, pageOffset);

        List<Map<String, Object>> points = new ArrayList<>();
        for (PointCloudData point : data) {
            Map<String, Object> pointMap = new HashMap<>();
            pointMap.put("x", point.getX());
            pointMap.put("y", point.getY());
            pointMap.put("z", point.getZ());
            pointMap.put("intensity", point.getIntensity());
            pointMap.put("r", point.getR());
            pointMap.put("g", point.getG());
            pointMap.put("b", point.getB());
            pointMap.put("classification", point.getClassification());
            points.add(pointMap);
        }
        result.put("points", points);
        result.put("count", points.size());

        return result;
    }

    public Map<String, Object> getPointCloudDataByHeightRange(
            String mineId, Double minHeight, Double maxHeight, Integer limit, Integer offset) {
        Map<String, Object> result = new HashMap<>();

        int pageSize = limit != null ? Math.min(limit, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
        int pageOffset = offset != null ? offset : 0;

        Long filteredTotal = pointCloudDataRepository.countByMineIdAndHeightRange(mineId, minHeight, maxHeight);
        result.put("total", filteredTotal);
        result.put("limit", pageSize);
        result.put("offset", pageOffset);
        result.put("hasMore", (pageOffset + pageSize) < filteredTotal);

        List<PointCloudData> data = pointCloudDataRepository.findByMineIdAndHeightRange(
                mineId, minHeight, maxHeight, pageSize, pageOffset);

        List<Map<String, Object>> points = new ArrayList<>();
        for (PointCloudData point : data) {
            Map<String, Object> pointMap = new HashMap<>();
            pointMap.put("x", point.getX());
            pointMap.put("y", point.getY());
            pointMap.put("z", point.getZ());
            pointMap.put("intensity", point.getIntensity());
            pointMap.put("r", point.getR());
            pointMap.put("g", point.getG());
            pointMap.put("b", point.getB());
            pointMap.put("classification", point.getClassification());
            points.add(pointMap);
        }
        result.put("points", points);
        result.put("count", points.size());

        return result;
    }

    public Map<String, Object> getHeightRange(String mineId) {
        Map<String, Object> result = new HashMap<>();
        List<Object[]> range = pointCloudDataRepository.findHeightRangeByMineId(mineId);

        if (range != null && !range.isEmpty() && range.get(0)[0] != null) {
            result.put("minHeight", range.get(0)[0]);
            result.put("maxHeight", range.get(0)[1]);
        } else {
            result.put("minHeight", 0);
            result.put("maxHeight", 100);
        }

        return result;
    }

    @Transactional
    public PointCloudData addPointCloudData(String mineId, PointCloudDTO dto) {
        PointCloudData pointCloudData = new PointCloudData();
        pointCloudData.setMineId(mineId);
        pointCloudData.setX(dto.getX());
        pointCloudData.setY(dto.getY());
        pointCloudData.setZ(dto.getZ());
        pointCloudData.setIntensity(dto.getIntensity());
        pointCloudData.setR(dto.getR());
        pointCloudData.setG(dto.getG());
        pointCloudData.setB(dto.getB());
        pointCloudData.setClassification(dto.getClassification());

        Point location = geometryFactory.createPoint(
                new Coordinate(dto.getX(), dto.getY(), dto.getZ()));
        location.setSRID(4326);
        pointCloudData.setLocation(location);

        return pointCloudDataRepository.save(pointCloudData);
    }

    @Transactional
    public Map<String, Object> batchImportPointCloud(String mineId, List<PointCloudDTO> dtos) {
        Map<String, Object> result = new HashMap<>();
        int batchSize = 5000;
        int totalSaved = 0;

        List<PointCloudData> batch = new ArrayList<>();

        for (int i = 0; i < dtos.size(); i++) {
            PointCloudDTO dto = dtos.get(i);
            PointCloudData pointCloudData = new PointCloudData();
            pointCloudData.setMineId(mineId);
            pointCloudData.setX(dto.getX());
            pointCloudData.setY(dto.getY());
            pointCloudData.setZ(dto.getZ());
            pointCloudData.setIntensity(dto.getIntensity());
            pointCloudData.setR(dto.getR());
            pointCloudData.setG(dto.getG());
            pointCloudData.setB(dto.getB());
            pointCloudData.setClassification(dto.getClassification());

            Point location = geometryFactory.createPoint(
                    new Coordinate(dto.getX(), dto.getY(), dto.getZ()));
            location.setSRID(4326);
            pointCloudData.setLocation(location);

            batch.add(pointCloudData);

            if (batch.size() >= batchSize || i == dtos.size() - 1) {
                pointCloudDataRepository.saveAll(batch);
                pointCloudDataRepository.flush();
                totalSaved += batch.size();
                batch.clear();
            }
        }

        result.put("success", true);
        result.put("message", "Batch import successful");
        result.put("count", totalSaved);
        return result;
    }

    public void deletePointCloudData(Long id) {
        pointCloudDataRepository.deleteById(id);
    }

    public long getPointCount(String mineId) {
        return pointCloudDataRepository.countByMineId(mineId);
    }
}
