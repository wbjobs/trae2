package com.gis3d;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@SpringBootApplication
@EntityScan(basePackages = "com.gis3d.entity")
@EnableJpaRepositories(basePackages = "com.gis3d.repository")
public class Gis3dMappingApplication {

    public static void main(String[] args) {
        SpringApplication.run(Gis3dMappingApplication.class, args);
        System.out.println("""
            ======================================================
            3D GIS Mapping Visualization System Started Successfully!
            Backend API: http://localhost:8080/api
            ======================================================
            """);
    }
}
