package com.doccollab.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class TokenResponse {

    private String token;

    private String tokenType;

    private Long expiresIn;

    private UserDTO user;
}
