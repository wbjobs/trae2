package com.research.asset.service;

import com.research.asset.dto.PermissionDTO;
import com.research.asset.dto.RoleDTO;
import com.research.asset.entity.Permission;
import com.research.asset.entity.Role;
import com.research.asset.entity.User;
import com.research.asset.repository.PermissionRepository;
import com.research.asset.repository.RoleRepository;
import com.research.asset.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PermissionService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;

    public boolean hasPermission(UUID userId, String permissionCode) {
        User user = userRepository.findByIdWithRoles(userId)
                .orElseThrow(() -> new EntityNotFoundException("用户不存在"));
        for (Role role : user.getRoles()) {
            Role roleWithPerms = roleRepository.findByIdWithPermissions(role.getId())
                    .orElse(null);
            if (roleWithPerms != null) {
                for (Permission perm : roleWithPerms.getPermissions()) {
                    if (perm.getPermissionCode().equals(permissionCode)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    public List<RoleDTO> getUserRoles(UUID userId) {
        User user = userRepository.findByIdWithRoles(userId)
                .orElseThrow(() -> new EntityNotFoundException("用户不存在"));
        return user.getRoles().stream()
                .map(this::convertRoleToDTO)
                .collect(Collectors.toList());
    }

    public List<PermissionDTO> getUserPermissions(UUID userId) {
        User user = userRepository.findByIdWithRoles(userId)
                .orElseThrow(() -> new EntityNotFoundException("用户不存在"));
        Set<Permission> allPermissions = new HashSet<>();
        for (Role role : user.getRoles()) {
            Role roleWithPerms = roleRepository.findByIdWithPermissions(role.getId())
                    .orElse(null);
            if (roleWithPerms != null) {
                allPermissions.addAll(roleWithPerms.getPermissions());
            }
        }
        return allPermissions.stream()
                .map(this::convertPermissionToDTO)
                .collect(Collectors.toList());
    }

    @Transactional
    public void assignRole(UUID userId, UUID roleId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("用户不存在"));
        Role role = roleRepository.findById(roleId)
                .orElseThrow(() -> new EntityNotFoundException("角色不存在"));
        if (user.getRoles() == null) {
            user.setRoles(new HashSet<>());
        }
        user.getRoles().add(role);
        userRepository.save(user);
    }

    @Transactional
    public void assignPermission(UUID roleId, UUID permissionId) {
        Role role = roleRepository.findById(roleId)
                .orElseThrow(() -> new EntityNotFoundException("角色不存在"));
        Permission permission = permissionRepository.findById(permissionId)
                .orElseThrow(() -> new EntityNotFoundException("权限不存在"));
        if (role.getPermissions() == null) {
            role.setPermissions(new HashSet<>());
        }
        role.getPermissions().add(permission);
        roleRepository.save(role);
    }

    public List<RoleDTO> getAllRoles() {
        return roleRepository.findAll().stream()
                .map(this::convertRoleToDTO)
                .collect(Collectors.toList());
    }

    public List<PermissionDTO> getAllPermissions() {
        return permissionRepository.findAll().stream()
                .map(this::convertPermissionToDTO)
                .collect(Collectors.toList());
    }

    @Transactional
    public RoleDTO createRole(RoleDTO dto) {
        if (roleRepository.existsByRoleCode(dto.getRoleCode())) {
            throw new RuntimeException("角色编码已存在");
        }
        Role role = new Role();
        role.setRoleCode(dto.getRoleCode());
        role.setRoleName(dto.getRoleName());
        role.setDescription(dto.getDescription());
        role.setLevel(dto.getLevel() != null ? dto.getLevel() : 1);
        role = roleRepository.save(role);
        return convertRoleToDTO(role);
    }

    @Transactional
    public PermissionDTO createPermission(PermissionDTO dto) {
        if (permissionRepository.existsByPermissionCode(dto.getPermissionCode())) {
            throw new RuntimeException("权限编码已存在");
        }
        Permission permission = new Permission();
        permission.setPermissionCode(dto.getPermissionCode());
        permission.setPermissionName(dto.getPermissionName());
        permission.setResourceType(dto.getResourceType());
        permission.setAction(dto.getAction());
        permission = permissionRepository.save(permission);
        return convertPermissionToDTO(permission);
    }

    private RoleDTO convertRoleToDTO(Role role) {
        RoleDTO dto = new RoleDTO();
        dto.setId(role.getId());
        dto.setRoleCode(role.getRoleCode());
        dto.setRoleName(role.getRoleName());
        dto.setDescription(role.getDescription());
        dto.setLevel(role.getLevel());
        return dto;
    }

    private PermissionDTO convertPermissionToDTO(Permission permission) {
        PermissionDTO dto = new PermissionDTO();
        dto.setId(permission.getId());
        dto.setPermissionCode(permission.getPermissionCode());
        dto.setPermissionName(permission.getPermissionName());
        dto.setResourceType(permission.getResourceType());
        dto.setAction(permission.getAction());
        return dto;
    }
}
