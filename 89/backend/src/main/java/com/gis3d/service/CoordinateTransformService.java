package com.gis3d.service;

import com.gis3d.dto.CoordinateDTO;
import org.geotools.geometry.jts.JTS;
import org.geotools.referencing.CRS;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.opengis.referencing.crs.CoordinateReferenceSystem;
import org.opengis.referencing.operation.MathTransform;
import org.springframework.stereotype.Service;

@Service
public class CoordinateTransformService {

    private final GeometryFactory geometryFactory = new GeometryFactory();

    public CoordinateDTO transform(CoordinateDTO source, int targetSrid) {
        try {
            CoordinateReferenceSystem sourceCRS = CRS.decode("EPSG:" + source.getSrid());
            CoordinateReferenceSystem targetCRS = CRS.decode("EPSG:" + targetSrid);
            MathTransform transform = CRS.findMathTransform(sourceCRS, targetCRS, true);

            Coordinate srcCoord = new Coordinate(source.getX(), source.getY());
            if (source.getZ() != null) {
                srcCoord.setZ(source.getZ());
            }

            Coordinate targetCoord = JTS.transform(srcCoord, null, transform);

            CoordinateDTO result = new CoordinateDTO();
            result.setX(targetCoord.x);
            result.setY(targetCoord.y);
            if (!Double.isNaN(targetCoord.getZ())) {
                result.setZ(targetCoord.getZ());
            }
            result.setSrid(targetSrid);

            return result;
        } catch (Exception e) {
            throw new RuntimeException("坐标转换失败: " + e.getMessage(), e);
        }
    }

    public Geometry transformGeometry(Geometry geometry, int targetSrid) {
        try {
            int sourceSrid = geometry.getSRID();
            if (sourceSrid == targetSrid) {
                return geometry;
            }

            CoordinateReferenceSystem sourceCRS = CRS.decode("EPSG:" + sourceSrid);
            CoordinateReferenceSystem targetCRS = CRS.decode("EPSG:" + targetSrid);
            MathTransform transform = CRS.findMathTransform(sourceCRS, targetCRS, true);

            Geometry transformed = JTS.transform(geometry, transform);
            transformed.setSRID(targetSrid);
            return transformed;
        } catch (Exception e) {
            throw new RuntimeException("几何坐标转换失败: " + e.getMessage(), e);
        }
    }

    public CoordinateDTO wgs84ToWebMercator(CoordinateDTO wgs84) {
        wgs84.setSrid(4326);
        return transform(wgs84, 3857);
    }

    public CoordinateDTO webMercatorToWgs84(CoordinateDTO mercator) {
        mercator.setSrid(3857);
        return transform(mercator, 4326);
    }

    public CoordinateDTO wgs84ToLocal(CoordinateDTO wgs84, double centerLon, double centerLat) {
        double earthRadius = 6378137.0;
        double radLon = Math.toRadians(wgs84.getX() - centerLon);
        double radLat = Math.toRadians(wgs84.getY() - centerLat);
        double centerRadLat = Math.toRadians(centerLat);

        double x = radLon * Math.cos(centerRadLat) * earthRadius;
        double y = radLat * earthRadius;

        CoordinateDTO result = new CoordinateDTO();
        result.setX(x);
        result.setY(y);
        result.setZ(wgs84.getZ());
        result.setSrid(0);
        return result;
    }

    public double calculateDistance(CoordinateDTO p1, CoordinateDTO p2) {
        if (p1.getSrid() == null || p2.getSrid() == null) {
            return Math.sqrt(Math.pow(p2.getX() - p1.getX(), 2) + Math.pow(p2.getY() - p1.getY(), 2));
        }

        try {
            if (p1.getSrid().equals(p2.getSrid()) && p1.getSrid() == 4326) {
                double earthRadius = 6378137.0;
                double radLat1 = Math.toRadians(p1.getY());
                double radLat2 = Math.toRadians(p2.getY());
                double deltaLat = Math.toRadians(p2.getY() - p1.getY());
                double deltaLon = Math.toRadians(p2.getX() - p1.getX());

                double a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                        Math.cos(radLat1) * Math.cos(radLat2) *
                                Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
                double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

                return earthRadius * c;
            } else {
                CoordinateDTO p14326 = p1.getSrid() == 4326 ? p1 : transform(p1, 4326);
                CoordinateDTO p24326 = p2.getSrid() == 4326 ? p2 : transform(p2, 4326);
                return calculateDistance(p14326, p24326);
            }
        } catch (Exception e) {
            return Math.sqrt(Math.pow(p2.getX() - p1.getX(), 2) + Math.pow(p2.getY() - p1.getY(), 2));
        }
    }

    public double calculateArea(double[] coordinates) {
        if (coordinates.length < 6 || coordinates.length % 2 != 0) {
            throw new IllegalArgumentException("坐标点数量不足");
        }

        int n = coordinates.length / 2;
        double area = 0;

        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n;
            double x1 = coordinates[i * 2];
            double y1 = coordinates[i * 2 + 1];
            double x2 = coordinates[j * 2];
            double y2 = coordinates[j * 2 + 1];
            area += x1 * y2 - x2 * y1;
        }

        return Math.abs(area / 2.0);
    }
}
