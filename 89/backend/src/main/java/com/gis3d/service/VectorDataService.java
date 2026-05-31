package com.gis3d.service;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.gis3d.dto.CoordinateDTO;
import com.gis3d.dto.PageResult;
import com.gis3d.entity.VectorData;
import com.gis3d.repository.VectorDataRepository;
import org.locationtech.jts.geom.*;
import org.locationtech.jts.io.geojson.GeoJsonReader;
import org.locationtech.jts.io.geojson.GeoJsonWriter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Stream;

@Service
public class VectorDataService {

    @Autowired
    private VectorDataRepository vectorDataRepository;

    @Autowired
    private CoordinateTransformService coordinateTransformService;

    private final GeometryFactory geometryFactory = new GeometryFactory();
    private final GeoJsonReader geoJsonReader = new GeoJsonReader();
    private final GeoJsonWriter geoJsonWriter = new GeoJsonWriter();

    public List<VectorData> findAll() {
        return vectorDataRepository.findAll();
    }

    public VectorData findById(Long id) {
        return vectorDataRepository.findById(id).orElse(null);
    }

    public VectorData save(VectorData vectorData) {
        return vectorDataRepository.save(vectorData);
    }

    public void delete(Long id) {
        vectorDataRepository.deleteById(id);
    }

    public List<VectorData> findByLayerName(String layerName) {
        return vectorDataRepository.findByLayerName(layerName);
    }

    public List<String> findAllLayerNames() {
        return vectorDataRepository.findAllLayerNames();
    }

    public List<VectorData> findByBbox(double minX, double minY, double maxX, double maxY, Integer srid) {
        Coordinate[] coords = new Coordinate[] {
                new Coordinate(minX, minY),
                new Coordinate(minX, maxY),
                new Coordinate(maxX, maxY),
                new Coordinate(maxX, minY),
                new Coordinate(minX, minY)
        };
        LinearRing ring = geometryFactory.createLinearRing(coords);
        Polygon bbox = geometryFactory.createPolygon(ring);
        bbox.setSRID(srid != null ? srid : 4326);
        return vectorDataRepository.findByBbox(bbox);
    }

    public List<VectorData> findWithinDistance(double x, double y, double distance, Integer srid) {
        Point point = geometryFactory.createPoint(new Coordinate(x, y));
        point.setSRID(srid != null ? srid : 4326);
        return vectorDataRepository.findWithinDistance(point, distance);
    }

    public String getGeoJsonById(Long id) {
        VectorData data = findById(id);
        if (data == null || data.getGeom() == null) {
            return null;
        }
        return geoJsonWriter.write(data.getGeom());
    }

    public JSONObject toGeoJsonFeature(VectorData data) {
        JSONObject feature = new JSONObject();
        feature.put("type", "Feature");
        feature.put("id", data.getId());

        JSONObject properties = new JSONObject();
        properties.put("name", data.getName());
        properties.put("type", data.getType());
        properties.put("layerName", data.getLayerName());
        if (data.getProperties() != null) {
            for (Map.Entry<String, Object> entry : data.getProperties().entrySet()) {
                properties.put(entry.getKey(), entry.getValue());
            }
        }
        feature.put("properties", properties);

        if (data.getGeom() != null) {
            feature.put("geometry", JSON.parse(geoJsonWriter.write(data.getGeom())));
        }

        return feature;
    }

    public JSONObject toGeoJsonCollection(List<VectorData> dataList) {
        JSONObject collection = new JSONObject();
        collection.put("type", "FeatureCollection");

        JSONArray features = new JSONArray();
        for (VectorData data : dataList) {
            features.add(toGeoJsonFeature(data));
        }
        collection.put("features", features);

        return collection;
    }

    public List<VectorData> importGeoJson(MultipartFile file) {
        List<VectorData> result = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {

            StringBuilder content = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                content.append(line);
            }

            JSONObject json = JSON.parseObject(content.toString());
            String type = json.getString("type");

            if ("FeatureCollection".equals(type)) {
                JSONArray features = json.getJSONArray("features");
                for (int i = 0; i < features.size(); i++) {
                    VectorData data = parseFeature(features.getJSONObject(i));
                    if (data != null) {
                        result.add(vectorDataRepository.save(data));
                    }
                }
            } else if ("Feature".equals(type)) {
                VectorData data = parseFeature(json);
                if (data != null) {
                    result.add(vectorDataRepository.save(data));
                }
            }

            return result;
        } catch (Exception e) {
            throw new RuntimeException("导入GeoJSON失败: " + e.getMessage(), e);
        }
    }

    private VectorData parseFeature(JSONObject feature) {
        try {
            JSONObject geometry = feature.getJSONObject("geometry");
            if (geometry == null) {
                return null;
            }

            Geometry geom = geoJsonReader.read(geometry.toJSONString());
            if (geom.getSRID() == 0) {
                geom.setSRID(4326);
            }

            VectorData data = new VectorData();
            data.setGeom(geom);
            data.setType(geometry.getString("type"));

            JSONObject properties = feature.getJSONObject("properties");
            if (properties != null) {
                data.setName(properties.getString("name"));
                data.setLayerName(properties.getString("layerName"));
                data.setSrid(properties.getInteger("srid"));
                if (data.getName() == null) {
                    data.setName("Feature_" + System.currentTimeMillis());
                }

                Map<String, Object> props = properties.getInnerMap();
                props.remove("name");
                props.remove("layerName");
                props.remove("srid");
                if (!props.isEmpty()) {
                    data.setProperties(props);
                }
            } else {
                data.setName("Feature_" + System.currentTimeMillis());
            }

            return data;
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    public VectorData createFromCoordinate(CoordinateDTO coord, String name, String layerName) {
        Point point = geometryFactory.createPoint(new Coordinate(coord.getX(), coord.getY()));
        point.setSRID(coord.getSrid() != null ? coord.getSrid() : 4326);

        VectorData data = new VectorData();
        data.setName(name);
        data.setType("Point");
        data.setGeom(point);
        data.setSrid(point.getSRID());
        data.setLayerName(layerName);

        return vectorDataRepository.save(data);
    }

    public PageResult<VectorData> findAll(int page, int size, String sortBy, String sortDir) {
        Sort sort = Sort.by(sortDir.equalsIgnoreCase("desc") ? Sort.Direction.DESC : Sort.Direction.ASC, sortBy);
        Pageable pageable = PageRequest.of(page, size, sort);
        Page<VectorData> result = vectorDataRepository.findAll(pageable);
        return PageResult.of(result.getContent(), page, size, result.getTotalElements());
    }

    public PageResult<VectorData> findByLayerName(String layerName, int page, int size, String sortBy, String sortDir) {
        Sort sort = Sort.by(sortDir.equalsIgnoreCase("desc") ? Sort.Direction.DESC : Sort.Direction.ASC, sortBy);
        Pageable pageable = PageRequest.of(page, size, sort);
        Page<VectorData> result = vectorDataRepository.findByLayerName(layerName, pageable);
        return PageResult.of(result.getContent(), page, size, result.getTotalElements());
    }

    public PageResult<VectorData> findByType(String type, int page, int size, String sortBy, String sortDir) {
        Sort sort = Sort.by(sortDir.equalsIgnoreCase("desc") ? Sort.Direction.DESC : Sort.Direction.ASC, sortBy);
        Pageable pageable = PageRequest.of(page, size, sort);
        Page<VectorData> result = vectorDataRepository.findByType(type, pageable);
        return PageResult.of(result.getContent(), page, size, result.getTotalElements());
    }

    public PageResult<VectorData> findByBbox(double minX, double minY, double maxX, double maxY, Integer srid, int page, int size, String sortBy, String sortDir) {
        Coordinate[] coords = new Coordinate[] {
                new Coordinate(minX, minY),
                new Coordinate(minX, maxY),
                new Coordinate(maxX, maxY),
                new Coordinate(maxX, minY),
                new Coordinate(minX, minY)
        };
        LinearRing ring = geometryFactory.createLinearRing(coords);
        Polygon bbox = geometryFactory.createPolygon(ring);
        bbox.setSRID(srid != null ? srid : 4326);

        Sort sort = Sort.by(sortDir.equalsIgnoreCase("desc") ? Sort.Direction.DESC : Sort.Direction.ASC, sortBy);
        Pageable pageable = PageRequest.of(page, size, sort);
        Page<VectorData> result = vectorDataRepository.findByBbox(bbox, pageable);
        return PageResult.of(result.getContent(), page, size, result.getTotalElements());
    }

    public PageResult<VectorData> findWithinDistance(double x, double y, double distance, Integer srid, int page, int size, String sortBy, String sortDir) {
        Point point = geometryFactory.createPoint(new Coordinate(x, y));
        point.setSRID(srid != null ? srid : 4326);

        Sort sort = Sort.by(sortDir.equalsIgnoreCase("desc") ? Sort.Direction.DESC : Sort.Direction.ASC, sortBy);
        Pageable pageable = PageRequest.of(page, size, sort);
        Page<VectorData> result = vectorDataRepository.findWithinDistance(point, distance, pageable);
        return PageResult.of(result.getContent(), page, size, result.getTotalElements());
    }

    public PageResult<VectorData> findWithFilters(String layerName, String type, Double minX, Double minY, Double maxX, Double maxY, Integer srid, int page, int size, String sortBy, String sortDir) {
        Polygon bbox = null;
        if (minX != null && minY != null && maxX != null && maxY != null) {
            Coordinate[] coords = new Coordinate[] {
                    new Coordinate(minX, minY),
                    new Coordinate(minX, maxY),
                    new Coordinate(maxX, maxY),
                    new Coordinate(maxX, minY),
                    new Coordinate(minX, minY)
            };
            LinearRing ring = geometryFactory.createLinearRing(coords);
            bbox = geometryFactory.createPolygon(ring);
            bbox.setSRID(srid != null ? srid : 4326);
        }

        Sort sort = Sort.by(sortDir.equalsIgnoreCase("desc") ? Sort.Direction.DESC : Sort.Direction.ASC, sortBy);
        Pageable pageable = PageRequest.of(page, size, sort);
        Page<VectorData> result = vectorDataRepository.findWithFilters(layerName, type, bbox, pageable);
        return PageResult.of(result.getContent(), page, size, result.getTotalElements());
    }

    public PageResult<JSONObject> findAsGeoJsonWithFilters(String layerName, String type, Double minX, Double minY, Double maxX, Double maxY, Integer srid, int page, int size, String sortBy, String sortDir) {
        PageResult<VectorData> pageResult = findWithFilters(layerName, type, minX, minY, maxX, maxY, srid, page, size, sortBy, sortDir);
        List<JSONObject> features = new ArrayList<>();
        for (VectorData data : pageResult.getContent()) {
            features.add(toGeoJsonFeature(data));
        }

        JSONObject featureCollection = new JSONObject();
        featureCollection.put("type", "FeatureCollection");
        featureCollection.put("features", features);
        featureCollection.put("page", page);
        featureCollection.put("size", size);
        featureCollection.put("totalElements", pageResult.getTotalElements());
        featureCollection.put("totalPages", pageResult.getTotalPages());

        return PageResult.of(List.of(featureCollection), page, size, pageResult.getTotalElements());
    }

    public long countAll() {
        return vectorDataRepository.count();
    }

    public long countByLayerName(String layerName) {
        return vectorDataRepository.countByLayerName(layerName);
    }

    public long countByType(String type) {
        return vectorDataRepository.countByType(type);
    }

    public long countByBbox(double minX, double minY, double maxX, double maxY, Integer srid) {
        Coordinate[] coords = new Coordinate[] {
                new Coordinate(minX, minY),
                new Coordinate(minX, maxY),
                new Coordinate(maxX, maxY),
                new Coordinate(maxX, minY),
                new Coordinate(minX, minY)
        };
        LinearRing ring = geometryFactory.createLinearRing(coords);
        Polygon bbox = geometryFactory.createPolygon(ring);
        bbox.setSRID(srid != null ? srid : 4326);
        return vectorDataRepository.countByBbox(bbox);
    }

    @Transactional(readOnly = true)
    public void streamAll(Consumer<VectorData> consumer) {
        try (Stream<VectorData> stream = vectorDataRepository.streamAll()) {
            stream.forEach(consumer);
        }
    }

    @Transactional(readOnly = true)
    public void streamByLayerName(String layerName, Consumer<VectorData> consumer) {
        try (Stream<VectorData> stream = vectorDataRepository.streamByLayerName(layerName)) {
            stream.forEach(consumer);
        }
    }

    @Transactional(readOnly = true)
    public void streamByBbox(double minX, double minY, double maxX, double maxY, Integer srid, Consumer<VectorData> consumer) {
        Coordinate[] coords = new Coordinate[] {
                new Coordinate(minX, minY),
                new Coordinate(minX, maxY),
                new Coordinate(maxX, maxY),
                new Coordinate(maxX, minY),
                new Coordinate(minX, minY)
        };
        LinearRing ring = geometryFactory.createLinearRing(coords);
        Polygon bbox = geometryFactory.createPolygon(ring);
        bbox.setSRID(srid != null ? srid : 4326);

        try (Stream<VectorData> stream = vectorDataRepository.streamByBbox(bbox)) {
            stream.forEach(consumer);
        }
    }

    @Transactional(readOnly = true)
    public JSONObject streamAllAsGeoJson() {
        JSONArray features = new JSONArray();
        streamAll(data -> features.add(toGeoJsonFeature(data)));

        JSONObject collection = new JSONObject();
        collection.put("type", "FeatureCollection");
        collection.put("features", features);
        return collection;
    }
}
