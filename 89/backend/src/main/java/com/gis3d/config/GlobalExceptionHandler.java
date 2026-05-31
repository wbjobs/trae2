package com.gis3d.config;

import com.gis3d.dto.Result;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(NoHandlerFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public Result<Map<String, Object>> handleNotFound(NoHandlerFoundException e, HttpServletRequest request) {
        logger.warn("404 Not Found: {} {}", request.getMethod(), request.getRequestURI());
        Map<String, Object> info = new HashMap<>();
        info.put("method", e.getHttpMethod());
        info.put("path", e.getRequestURL());
        info.put("availableApis", getAvailableApis());
        return Result.error(404, "API not found: " + e.getRequestURL(), info);
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public Result<String> handleException(Exception e, HttpServletRequest request) {
        logger.error("Error on {} {}: {}", request.getMethod(), request.getRequestURI(), e.getMessage(), e);
        return Result.error(500, "Internal server error: " + e.getMessage());
    }

    private Map<String, String[]> getAvailableApis() {
        Map<String, String[]> apis = new HashMap<>();
        apis.put("vector", new String[]{
            "GET /vector - List all vector data",
            "GET /vector/{id} - Get vector by id",
            "POST /vector - Save vector data",
            "DELETE /vector/{id} - Delete vector data",
            "GET /vector/layer/{layerName} - Get by layer name",
            "GET /vector/layers - List all layer names",
            "GET /vector/bbox - BBOX spatial query",
            "GET /vector/within - Distance query",
            "GET /vector/geojson - Export all as GeoJSON",
            "POST /vector/import/geojson - Import GeoJSON file"
        });
        apis.put("coordinate", new String[]{
            "POST /coordinate/transform - Coordinate transformation",
            "POST /coordinate/distance - Calculate distance",
            "POST /coordinate/area - Calculate polygon area"
        });
        apis.put("annotation", new String[]{
            "GET /annotation - List all annotations",
            "POST /annotation - Save annotation",
            "DELETE /annotation/{id} - Delete annotation",
            "POST /annotation/point - Create point annotation"
        });
        return apis;
    }
}
