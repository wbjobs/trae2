package com.research.asset.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class PermissionDTO {

    private UUID id;
    private String permissionCode;
    private String permissionName;
    private String resourceType;
    private String action;
}
