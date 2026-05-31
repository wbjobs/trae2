package com.gis3d.controller;

import com.alibaba.fastjson2.JSONObject;
import com.gis3d.dto.PageResult;
import com.gis3d.dto.Result;
import com.gis3d.entity.VectorData;
import com.gis3d.service.VectorDataService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/vector")
public class VectorDataController {

    @Autowired
    private VectorDataService vectorDataService;

    @GetMapping
    public Result<List<VectorData>> findAll() {
        return Result.success(vectorDataService.findAll());
    }

    @GetMapping("/{id}")
    public Result<VectorData> findById(@PathVariable Long id) {
        return Result.success(vectorDataService.findById(id));
    }

    @PostMapping
    public Result<VectorData> save(@RequestBody VectorData vectorData) {
        return Result.success(vectorDataService.save(vectorData));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        vectorDataService.delete(id);
        return Result.success();
    }

    @GetMapping("/layer/{layerName}")
    public Result<List<VectorData>> findByLayerName(@PathVariable String layerName) {
        return Result.success(vectorDataService.findByLayerName(layerName));
    }

    @GetMapping("/layers")
    public Result<List<String>> findAllLayerNames() {
        return Result.success(vectorDataService.findAllLayerNames());
    }

    @GetMapping("/bbox")
    public Result<List<VectorData>> findByBbox(
            @RequestParam double minX,
            @RequestParam double minY,
            @RequestParam double maxX,
            @RequestParam double maxY,
            @RequestParam(required = false, defaultValue = "4326") Integer srid) {
        return Result.success(vectorDataService.findByBbox(minX, minY, maxX, maxY, srid));
    }

    @GetMapping("/within")
    public Result<List<VectorData>> findWithinDistance(
            @RequestParam double x,
            @RequestParam double y,
            @RequestParam double distance,
            @RequestParam(required = false, defaultValue = "4326") Integer srid) {
        return Result.success(vectorDataService.findWithinDistance(x, y, distance, srid));
    }

    @GetMapping("/{id}/geojson")
    public Result<String> getGeoJsonById(@PathVariable Long id) {
        return Result.success(vectorDataService.getGeoJsonById(id));
    }

    @GetMapping("/geojson")
    public Result<JSONObject> getAllAsGeoJson() {
        return Result.success(vectorDataService.toGeoJsonCollection(vectorDataService.findAll()));
    }

    @GetMapping("/layer/{layerName}/geojson")
    public Result<JSONObject> getLayerAsGeoJson(@PathVariable String layerName) {
        return Result.success(vectorDataService.toGeoJsonCollection(vectorDataService.findByLayerName(layerName)));
    }

    @PostMapping("/import/geojson")
    public Result<List<VectorData>> importGeoJson(@RequestParam("file") MultipartFile file) {
        return Result.success(vectorDataService.importGeoJson(file));
    }

    @GetMapping("/page")
    public Result<PageResult<VectorData>> findAllPaged(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "id") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {
        return Result.success(vectorDataService.findAll(page, size, sortBy, sortDir));
    }

    @GetMapping("/layer/{layerName}/page")
    public Result<PageResult<VectorData>> findByLayerNamePaged(
            @PathVariable String layerName,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "id") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {
        return Result.success(vectorDataService.findByLayerName(layerName, page, size, sortBy, sortDir));
    }

    @GetMapping("/type/{type}/page")
    public Result<PageResult<VectorData>> findByTypePaged(
            @PathVariable String type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "id") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {
        return Result.success(vectorDataService.findByType(type, page, size, sortBy, sortDir));
    }

    @GetMapping("/bbox/page")
    public Result<PageResult<VectorData>> findByBboxPaged(
            @RequestParam double minX,
            @RequestParam double minY,
            @RequestParam double maxX,
            @RequestParam double maxY,
            @RequestParam(required = false, defaultValue = "4326") Integer srid,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "id") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {
        return Result.success(vectorDataService.findByBbox(minX, minY, maxX, maxY, srid, page, size, sortBy, sortDir));
    }

    @GetMapping("/within/page")
    public Result<PageResult<VectorData>> findWithinDistancePaged(
            @RequestParam double x,
            @RequestParam double y,
            @RequestParam double distance,
            @RequestParam(required = false, defaultValue = "4326") Integer srid,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "id") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {
        return Result.success(vectorDataService.findWithinDistance(x, y, distance, srid, page, size, sortBy, sortDir));
    }

    @GetMapping("/filter/page")
    public Result<PageResult<VectorData>> findWithFiltersPaged(
            @RequestParam(required = false) String layerName,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) Double minX,
            @RequestParam(required = false) Double minY,
            @RequestParam(required = false) Double maxX,
            @RequestParam(required = false) Double maxY,
            @RequestParam(required = false, defaultValue = "4326") Integer srid,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "id") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {
        return Result.success(vectorDataService.findWithFilters(layerName, type, minX, minY, maxX, maxY, srid, page, size, sortBy, sortDir));
    }

    @GetMapping("/filter/geojson/page")
    public Result<PageResult<JSONObject>> findAsGeoJsonWithFiltersPaged(
            @RequestParam(required = false) String layerName,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) Double minX,
            @RequestParam(required = false) Double minY,
            @RequestParam(required = false) Double maxX,
            @RequestParam(required = false) Double maxY,
            @RequestParam(required = false, defaultValue = "4326") Integer srid,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "id") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {
        return Result.success(vectorDataService.findAsGeoJsonWithFilters(layerName, type, minX, minY, maxX, maxY, srid, page, size, sortBy, sortDir));
    }

    @GetMapping("/count")
    public Result<Map<String, Long>> getCounts(
            @RequestParam(required = false) String layerName,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) Double minX,
            @RequestParam(required = false) Double minY,
            @RequestParam(required = false) Double maxX,
            @RequestParam(required = false) Double maxY,
            @RequestParam(required = false, defaultValue = "4326") Integer srid) {
        Map<String, Long> counts = new HashMap<>();
        counts.put("total", vectorDataService.countAll());

        if (layerName != null) {
            counts.put("byLayer", vectorDataService.countByLayerName(layerName));
        }
        if (type != null) {
            counts.put("byType", vectorDataService.countByType(type));
        }
        if (minX != null && minY != null && maxX != null && maxY != null) {
            counts.put("byBbox", vectorDataService.countByBbox(minX, minY, maxX, maxY, srid));
        }

        return Result.success(counts);
    }

    @GetMapping("/stream/geojson")
    public Result<JSONObject> streamAllAsGeoJson() {
        return Result.success(vectorDataService.streamAllAsGeoJson());
    }
}
