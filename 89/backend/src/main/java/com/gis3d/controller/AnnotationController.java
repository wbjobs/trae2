package com.gis3d.controller;

import com.gis3d.dto.CoordinateDTO;
import com.gis3d.dto.Result;
import com.gis3d.entity.Annotation;
import com.gis3d.service.AnnotationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/annotation")
public class AnnotationController {

    @Autowired
    private AnnotationService annotationService;

    @GetMapping
    public Result<List<Annotation>> findAll() {
        return Result.success(annotationService.findAll());
    }

    @GetMapping("/{id}")
    public Result<Annotation> findById(@PathVariable Long id) {
        return Result.success(annotationService.findById(id));
    }

    @PostMapping
    public Result<Annotation> save(@RequestBody Annotation annotation) {
        return Result.success(annotationService.save(annotation));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        annotationService.delete(id);
        return Result.success();
    }

    @GetMapping("/type/{type}")
    public Result<List<Annotation>> findByType(@PathVariable String type) {
        return Result.success(annotationService.findByType(type));
    }

    @PostMapping("/point")
    public Result<Annotation> createPointAnnotation(
            @RequestBody Map<String, Object> params) {
        CoordinateDTO coord = new CoordinateDTO();
        coord.setX(((Number) params.get("x")).doubleValue());
        coord.setY(((Number) params.get("y")).doubleValue());
        coord.setSrid(params.get("srid") != null ? ((Number) params.get("srid")).intValue() : 4326);

        String label = (String) params.get("label");
        String type = (String) params.get("type");
        @SuppressWarnings("unchecked")
        Map<String, Object> properties = (Map<String, Object>) params.get("properties");

        return Result.success(annotationService.createPointAnnotation(coord, label, type, properties));
    }
}
