package com.gis3d.controller;

import com.gis3d.dto.CoordinateDTO;
import com.gis3d.dto.Result;
import com.gis3d.service.CoordinateTransformService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/coordinate")
public class CoordinateController {

    @Autowired
    private CoordinateTransformService coordinateTransformService;

    @PostMapping("/transform")
    public Result<CoordinateDTO> transform(@RequestBody CoordinateDTO source, @RequestParam int targetSrid) {
        return Result.success(coordinateTransformService.transform(source, targetSrid));
    }

    @PostMapping("/wgs84-to-mercator")
    public Result<CoordinateDTO> wgs84ToWebMercator(@RequestBody CoordinateDTO wgs84) {
        return Result.success(coordinateTransformService.wgs84ToWebMercator(wgs84));
    }

    @PostMapping("/mercator-to-wgs84")
    public Result<CoordinateDTO> webMercatorToWgs84(@RequestBody CoordinateDTO mercator) {
        return Result.success(coordinateTransformService.webMercatorToWgs84(mercator));
    }

    @PostMapping("/to-local")
    public Result<CoordinateDTO> wgs84ToLocal(
            @RequestBody CoordinateDTO wgs84,
            @RequestParam double centerLon,
            @RequestParam double centerLat) {
        return Result.success(coordinateTransformService.wgs84ToLocal(wgs84, centerLon, centerLat));
    }

    @PostMapping("/distance")
    public Result<Double> calculateDistance(@RequestBody Map<String, CoordinateDTO> params) {
        CoordinateDTO p1 = params.get("p1");
        CoordinateDTO p2 = params.get("p2");
        return Result.success(coordinateTransformService.calculateDistance(p1, p2));
    }

    @PostMapping("/area")
    public Result<Double> calculateArea(@RequestBody Map<String, double[]> params) {
        double[] coordinates = params.get("coordinates");
        return Result.success(coordinateTransformService.calculateArea(coordinates));
    }
}
