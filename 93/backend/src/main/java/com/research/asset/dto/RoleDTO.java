package com.research.asset.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class RoleDTO {

    private UUID id;
    private String roleCode;
    private String roleName;
    private String description;
    private Integer level;
}
