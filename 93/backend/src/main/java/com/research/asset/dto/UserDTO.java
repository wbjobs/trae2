package com.research.asset.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class UserDTO {

    private UUID id;
    private String username;
    private String realName;
    private String email;
    private String phone;
    private String department;
    private Integer status;
    private String roleNames;
}
