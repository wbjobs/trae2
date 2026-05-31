package com.mine.terrain.service;

import com.mine.terrain.dto.MiningAreaDTO;
import com.mine.terrain.entity.MiningArea;
import com.mine.terrain.repository.MiningAreaRepository;
import org.locationtech.jts.geom.*;
import org.locationtech.jts.area.Area;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class MiningAreaService {

    @Autowired
    private MiningAreaRepository miningAreaRepository;

    @Autowired
    private GeometryFactory geometryFactory;

    public List<MiningAreaDTO> getMiningAreas(String mineId) {
        List<MiningArea> areas = miningAreaRepository.findByMineId(mineId);
        return areas.stream().map(this::convertToDTO).collect(Collectors.toList());
    }

    public MiningAreaDTO getMiningAreaById(Long id) {
        return miningAreaRepository.findById(id)
                .map(this::convertToDTO)
                .orElse(null);
    }

    @Transactional
    public MiningAreaDTO createMiningArea(MiningAreaDTO dto) {
        MiningArea miningArea = new MiningArea();
        miningArea.setMineId(dto.getMineId());
        miningArea.setName(dto.getName());
        miningArea.setDescription(dto.getDescription());
        miningArea.setStatus(dto.getStatus() != null ? dto.getStatus() : "active");
        miningArea.setOperator(dto.getOperator());

        Polygon polygon = createPolygonFromCoordinates(dto.getCoordinates());
        miningArea.setGeometry(polygon);

        double area = calculateArea(polygon);
        miningArea.setArea(area);
        dto.setArea(area);

        MiningArea saved = miningAreaRepository.save(miningArea);
        return convertToDTO(saved);
    }

    @Transactional
    public MiningAreaDTO updateMiningArea(Long id, MiningAreaDTO dto) {
        return miningAreaRepository.findById(id).map(miningArea -> {
            miningArea.setName(dto.getName());
            miningArea.setDescription(dto.getDescription());
            miningArea.setStatus(dto.getStatus());
            miningArea.setOperator(dto.getOperator());

            if (dto.getCoordinates() != null && !dto.getCoordinates().isEmpty()) {
                Polygon polygon = createPolygonFromCoordinates(dto.getCoordinates());
                miningArea.setGeometry(polygon);
                miningArea.setArea(calculateArea(polygon));
            }

            MiningArea saved = miningAreaRepository.save(miningArea);
            return convertToDTO(saved);
        }).orElse(null);
    }

    @Transactional
    public void deleteMiningArea(Long id) {
        miningAreaRepository.deleteById(id);
    }

    private Polygon createPolygonFromCoordinates(List<List<Double>> coordinates) {
        if (coordinates == null || coordinates.size() < 3) {
            throw new IllegalArgumentException("Polygon requires at least 3 points");
        }

        List<Coordinate> coordinateList = new ArrayList<>();
        for (List<Double> coord : coordinates) {
            if (coord.size() >= 2) {
                double x = coord.get(0);
                double y = coord.get(1);
                double z = coord.size() > 2 ? coord.get(2) : 0;
                coordinateList.add(new Coordinate(x, y, z));
            }
        }

        if (!coordinateList.get(0).equals(coordinateList.get(coordinateList.size() - 1))) {
            coordinateList.add(coordinateList.get(0));
        }

        Coordinate[] coordsArray = coordinateList.toArray(new Coordinate[0]);
        LinearRing ring = geometryFactory.createLinearRing(coordsArray);
        Polygon polygon = geometryFactory.createPolygon(ring);
        polygon.setSRID(4326);

        return polygon;
    }

    private double calculateArea(Polygon polygon) {
        return Area.ofArea(polygon);
    }

    private MiningAreaDTO convertToDTO(MiningArea area) {
        MiningAreaDTO dto = new MiningAreaDTO();
        dto.setId(area.getId());
        dto.setMineId(area.getMineId());
        dto.setName(area.getName());
        dto.setDescription(area.getDescription());
        dto.setArea(area.getArea());
        dto.setStatus(area.getStatus());
        dto.setOperator(area.getOperator());
        dto.setCreatedAt(area.getCreatedAt());
        dto.setUpdatedAt(area.getUpdatedAt());

        if (area.getGeometry() != null) {
            List<List<Double>> coordinates = new ArrayList<>();
            Coordinate[] coords = area.getGeometry().getCoordinates();
            for (Coordinate coord : coords) {
                List<Double> point = new ArrayList<>();
                point.add(coord.getX());
                point.add(coord.getY());
                point.add(coord.getZ());
                coordinates.add(point);
            }
            dto.setCoordinates(coordinates);
        }

        return dto;
    }
}
