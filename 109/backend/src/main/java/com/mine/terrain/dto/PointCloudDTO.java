package com.mine.terrain.dto;

import lombok.Data;

@Data
public class PointCloudDTO {
    private Double x;
    private Double y;
    private Double z;
    private Double intensity;
    private Integer r;
    private Integer g;
    private Integer b;
    private String classification;
}
