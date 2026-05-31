package com.mine.terrain.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class MiningAreaDTO {
    private Long id;
    private String mineId;
    private String name;
    private String description;
    private List<List<Double>> coordinates;
    private Double area;
    private String status;
    private String operator;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
