package com.gis3d.service;

import com.gis3d.dto.CoordinateDTO;
import com.gis3d.entity.Annotation;
import com.gis3d.repository.AnnotationRepository;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class AnnotationService {

    @Autowired
    private AnnotationRepository annotationRepository;

    private final GeometryFactory geometryFactory = new GeometryFactory();

    public List<Annotation> findAll() {
        return annotationRepository.findAll();
    }

    public Annotation findById(Long id) {
        return annotationRepository.findById(id).orElse(null);
    }

    public Annotation save(Annotation annotation) {
        return annotationRepository.save(annotation);
    }

    public void delete(Long id) {
        annotationRepository.deleteById(id);
    }

    public List<Annotation> findByType(String type) {
        return annotationRepository.findByType(type);
    }

    public Annotation createPointAnnotation(CoordinateDTO coord, String label, String type, Map<String, Object> properties) {
        Point point = geometryFactory.createPoint(new Coordinate(coord.getX(), coord.getY()));
        point.setSRID(coord.getSrid() != null ? coord.getSrid() : 4326);

        Annotation annotation = new Annotation();
        annotation.setType(type != null ? type : "point");
        annotation.setGeom(point);
        annotation.setLabel(label);
        annotation.setProperties(properties);

        return annotationRepository.save(annotation);
    }
}
