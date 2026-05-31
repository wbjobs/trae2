package com.mine.terrain.controller;

import com.mine.terrain.dto.PointCloudDTO;
import com.mine.terrain.service.PointCloudService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*", maxAge = 3600)
public class PointCloudController {

    @Autowired
    private PointCloudService pointCloudService;

    @GetMapping("/pointcloud/data/{mineId}")
    public ResponseEntity<Map<String, Object>> getPointCloudData(
            @PathVariable String mineId,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Integer offset) {
        Map<String, Object> result = pointCloudService.getPointCloudData(mineId, limit, offset);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/pointcloud/page/{mineId}")
    public ResponseEntity<Map<String, Object>> getPointCloudPage(
            @PathVariable String mineId,
            @RequestParam(defaultValue = "10000") Integer pageSize,
            @RequestParam(defaultValue = "0") Integer page) {
        int offset = page * pageSize;
        Map<String, Object> result = pointCloudService.getPointCloudData(mineId, pageSize, offset);
        result.put("page", page);
        result.put("pageSize", pageSize);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/pointcloud/range/{mineId}")
    public ResponseEntity<Map<String, Object>> getPointCloudByHeightRange(
            @PathVariable String mineId,
            @RequestParam Double minHeight,
            @RequestParam Double maxHeight,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Integer offset) {
        Map<String, Object> result = pointCloudService.getPointCloudDataByHeightRange(
                mineId, minHeight, maxHeight, limit, offset);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/pointcloud/heightrange/{mineId}")
    public ResponseEntity<Map<String, Object>> getHeightRange(@PathVariable String mineId) {
        Map<String, Object> result = pointCloudService.getHeightRange(mineId);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/pointcloud/count/{mineId}")
    public ResponseEntity<Map<String, Object>> getPointCount(@PathVariable String mineId) {
        long count = pointCloudService.getPointCount(mineId);
        Map<String, Object> result = new HashMap<>();
        result.put("count", count);
        result.put("mineId", mineId);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/pointcloud/add/{mineId}")
    public ResponseEntity<Map<String, Object>> addPointCloudData(
            @PathVariable String mineId,
            @RequestBody PointCloudDTO dto) {
        pointCloudService.addPointCloudData(mineId, dto);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "Point added successfully");
        return ResponseEntity.ok(result);
    }

    @PostMapping("/pointcloud/batch/{mineId}")
    public ResponseEntity<Map<String, Object>> batchImportPointCloud(
            @PathVariable String mineId,
            @RequestBody List<PointCloudDTO> dtos) {
        Map<String, Object> result = pointCloudService.batchImportPointCloud(mineId, dtos);
        return ResponseEntity.ok(result);
    }

    @DeleteMapping("/pointcloud/{id}")
    public ResponseEntity<Map<String, Object>> deletePointCloudData(@PathVariable Long id) {
        pointCloudService.deletePointCloudData(id);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "Point deleted successfully");
        return ResponseEntity.ok(result);
    }
}
