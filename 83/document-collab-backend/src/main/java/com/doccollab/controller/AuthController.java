package com.doccollab.controller;

import com.doccollab.annotation.AuditLog;
import com.doccollab.dto.LoginRequest;
import com.doccollab.dto.RegisterRequest;
import com.doccollab.dto.Result;
import com.doccollab.dto.TokenResponse;
import com.doccollab.dto.UserDTO;
import com.doccollab.security.CurrentUser;
import com.doccollab.service.AuthService;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.HashMap;
import java.util.Map;

@CrossOrigin
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @PostMapping("/register")
    @AuditLog(module = "AUTH", operation = "用户注册")
    public Result<TokenResponse> register(@Valid @RequestBody RegisterRequest request) {
        TokenResponse response = authService.register(request);
        return Result.success(response);
    }

    @PostMapping("/login")
    public Result<TokenResponse> login(@Valid @RequestBody LoginRequest request) {
        TokenResponse response = authService.login(request);
        return Result.success(response);
    }

    @GetMapping("/current")
    public Result<UserDTO> getCurrentUser() {
        CurrentUser currentUser = CurrentUser.get();
        UserDTO userDTO = new UserDTO();
        BeanUtils.copyProperties(currentUser, userDTO);
        return Result.success(userDTO);
    }

    @GetMapping("/check-admin")
    @PreAuthorize("hasRole('ADMIN')")
    public Result<Map<String, Boolean>> checkAdmin() {
        Map<String, Boolean> result = new HashMap<>();
        result.put("isAdmin", authService.isAdmin());
        return Result.success(result);
    }

    @GetMapping("/logout")
    @AuditLog(module = "AUTH", operation = "用户退出")
    public Result<Map<String, String>> logout() {
        CurrentUser.clear();
        Map<String, String> result = new HashMap<>();
        result.put("message", "退出成功");
        return Result.success(result);
    }
}
