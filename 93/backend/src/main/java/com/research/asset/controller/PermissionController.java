package com.research.asset.controller;

import com.research.asset.dto.PermissionDTO;
import com.research.asset.dto.Result;
import com.research.asset.dto.RoleDTO;
import com.research.asset.service.PermissionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/permissions")
@CrossOrigin
@RequiredArgsConstructor
public class PermissionController {

    private final PermissionService permissionService;

    @GetMapping("/roles")
    public Result<List<RoleDTO>> getAllRoles() {
        return Result.success(permissionService.getAllRoles());
    }

    @PostMapping("/roles")
    public Result<RoleDTO> createRole(@Valid @RequestBody RoleDTO dto) {
        return Result.success(permissionService.createRole(dto));
    }

    @GetMapping
    public Result<List<PermissionDTO>> getAllPermissions() {
        return Result.success(permissionService.getAllPermissions());
    }

    @PostMapping
    public Result<PermissionDTO> createPermission(@Valid @RequestBody PermissionDTO dto) {
        return Result.success(permissionService.createPermission(dto));
    }

    @PostMapping("/user/{userId}/role/{roleId}")
    public Result<Void> assignRole(@PathVariable UUID userId, @PathVariable UUID roleId) {
        permissionService.assignRole(userId, roleId);
        return Result.success();
    }

    @PostMapping("/role/{roleId}/permission/{permissionId}")
    public Result<Void> assignPermission(@PathVariable UUID roleId, @PathVariable UUID permissionId) {
        permissionService.assignPermission(roleId, permissionId);
        return Result.success();
    }

    @GetMapping("/user/{userId}")
    public Result<List<PermissionDTO>> getUserPermissions(@PathVariable UUID userId) {
        return Result.success(permissionService.getUserPermissions(userId));
    }

    @GetMapping("/check")
    public Result<Boolean> hasPermission(@RequestHeader UUID userId, @RequestParam String code) {
        return Result.success(permissionService.hasPermission(userId, code));
    }
}
