package com.mine.terrain.controller;

import com.mine.terrain.dto.MiningAreaDTO;
import com.mine.terrain.service.MiningAreaService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*", maxAge = 3600)
public class MiningAreaController {

    @Autowired
    private MiningAreaService miningAreaService;

    @GetMapping("/mining-area/list/{mineId}")
    public ResponseEntity<List<MiningAreaDTO>> getMiningAreas(@PathVariable String mineId) {
        List<MiningAreaDTO> areas = miningAreaService.getMiningAreas(mineId);
        return ResponseEntity.ok(areas);
    }

    @GetMapping("/mining-area/{id}")
    public ResponseEntity<MiningAreaDTO> getMiningAreaById(@PathVariable Long id) {
        MiningAreaDTO area = miningAreaService.getMiningAreaById(id);
        if (area != null) {
            return ResponseEntity.ok(area);
        }
        return ResponseEntity.notFound().build();
    }

    @PostMapping("/mining-area/create")
    public ResponseEntity<Map<String, Object>> createMiningArea(@RequestBody MiningAreaDTO dto) {
        Map<String, Object> result = new HashMap<>();
        try {
            MiningAreaDTO created = miningAreaService.createMiningArea(dto);
            result.put("success", true);
            result.put("data", created);
            result.put("message", "Mining area created successfully");
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", "Failed to create mining area: " + e.getMessage());
            return ResponseEntity.badRequest().body(result);
        }
    }

    @PutMapping("/mining-area/update/{id}")
    public ResponseEntity<Map<String, Object>> updateMiningArea(
            @PathVariable Long id,
            @RequestBody MiningAreaDTO dto) {
        Map<String, Object> result = new HashMap<>();
        try {
            MiningAreaDTO updated = miningAreaService.updateMiningArea(id, dto);
            if (updated != null) {
                result.put("success", true);
                result.put("data", updated);
                result.put("message", "Mining area updated successfully");
                return ResponseEntity.ok(result);
            }
            result.put("success", false);
            result.put("message", "Mining area not found");
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", "Failed to update mining area: " + e.getMessage());
            return ResponseEntity.badRequest().body(result);
        }
    }

    @DeleteMapping("/mining-area/delete/{id}")
    public ResponseEntity<Map<String, Object>> deleteMiningArea(@PathVariable Long id) {
        Map<String, Object> result = new HashMap<>();
        try {
            miningAreaService.deleteMiningArea(id);
            result.put("success", true);
            result.put("message", "Mining area deleted successfully");
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", "Failed to delete mining area: " + e.getMessage());
            return ResponseEntity.badRequest().body(result);
        }
    }
}
