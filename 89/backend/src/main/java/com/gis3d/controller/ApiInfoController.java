package com.gis3d.controller;

import com.gis3d.dto.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping
public class ApiInfoController {

    @GetMapping
    public Result<Map<String, Object>> getApiInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("name", "GIS 3D Mapping API");
        info.put("version", "1.0.0");
        info.put("description", "3D GIS Spatial Vector Surveying and Mapping Visualization System");

        List<Map<String, Object>> apis = new ArrayList<>();

        Map<String, Object> vectorApi = new HashMap<>();
        vectorApi.put("group", "Vector Data");
        vectorApi.put("endpoints", new String[]{
            "GET    /vector - List all vector data",
            "GET    /vector/{id} - Get vector by id",
            "POST   /vector - Save vector data",
            "DELETE /vector/{id} - Delete vector data",
            "GET    /vector/layer/{layerName} - Get by layer name",
            "GET    /vector/layers - List all layer names",
            "GET    /vector/bbox?minX&minY&maxX&maxY - BBOX spatial query",
            "GET    /vector/within?x&y&distance - Distance query",
            "GET    /vector/geojson - Export all as GeoJSON",
            "GET    /vector/{id}/geojson - Export single as GeoJSON",
            "GET    /vector/layer/{layerName}/geojson - Export layer as GeoJSON",
            "POST   /vector/import/geojson - Import GeoJSON file"
        });
        apis.add(vectorApi);

        Map<String, Object> coordApi = new HashMap<>();
        coordApi.put("group", "Coordinate Transform");
        coordApi.put("endpoints", new String[]{
            "POST /coordinate/transform - Coordinate transformation",
            "POST /coordinate/wgs84-to-mercator - WGS84 to Web Mercator",
            "POST /coordinate/mercator-to-wgs84 - Web Mercator to WGS84",
            "POST /coordinate/to-local - WGS84 to local coordinate",
            "POST /coordinate/distance - Calculate distance (Haversine/Vincenty)",
            "POST /coordinate/area - Calculate polygon area"
        });
        apis.add(coordApi);

        Map<String, Object> annoApi = new HashMap<>();
        annoApi.put("group", "Annotations");
        annoApi.put("endpoints", new String[]{
            "GET    /annotation - List all annotations",
            "GET    /annotation/{id} - Get annotation by id",
            "POST   /annotation - Save annotation",
            "DELETE /annotation/{id} - Delete annotation",
            "GET    /annotation/type/{type} - Get by type",
            "POST   /annotation/point - Create point annotation"
        });
        apis.add(annoApi);

        info.put("apis", apis);

        Map<String, String> sridInfo = new HashMap<>();
        sridInfo.put("4326", "WGS84 - World Geodetic System 1984");
        sridInfo.put("3857", "Web Mercator - Pseudo-Mercator");
        sridInfo.put("4490", "CGCS2000 - China Geodetic Coordinate System 2000");
        sridInfo.put("4549", "Gauss-Kruger 3-degree zone 39");
        info.put("supportedSRID", sridInfo);

        return Result.success(info);
    }

    @GetMapping("/health")
    public Result<Map<String, Object>> healthCheck() {
        Map<String, Object> health = new HashMap<>();
        health.put("status", "UP");
        health.put("timestamp", System.currentTimeMillis());
        health.put("service", "gis3d-mapping");
        return Result.success(health);
    }
}
