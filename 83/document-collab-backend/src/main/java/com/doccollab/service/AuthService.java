package com.doccollab.service;

import com.doccollab.dto.LoginRequest;
import com.doccollab.dto.RegisterRequest;
import com.doccollab.dto.TokenResponse;

public interface AuthService {

    TokenResponse register(RegisterRequest request);

    TokenResponse login(LoginRequest request);

    boolean hasPermission(String permission);

    boolean isAdmin();
}
