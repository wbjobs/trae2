package com.research.asset.controller;

import com.research.asset.dto.Result;
import com.research.asset.dto.UserDTO;
import com.research.asset.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
@CrossOrigin
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping
    public Result<List<UserDTO>> getAllUsers() {
        return Result.success(userService.getAllUsers());
    }

    @GetMapping("/{id}")
    public Result<UserDTO> getUserById(@PathVariable UUID id) {
        return Result.success(userService.getUserById(id));
    }

    @GetMapping("/username/{username}")
    public Result<UserDTO> getUserByUsername(@PathVariable String username) {
        return Result.success(userService.getUserByUsername(username));
    }

    @PostMapping
    public Result<UserDTO> createUser(@Valid @RequestBody UserDTO dto, @RequestParam String password) {
        return Result.success(userService.createUser(dto, password));
    }

    @PutMapping("/{id}")
    public Result<UserDTO> updateUser(@PathVariable UUID id, @Valid @RequestBody UserDTO dto) {
        return Result.success(userService.updateUser(id, dto));
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteUser(@PathVariable UUID id) {
        userService.deleteUser(id);
        return Result.success();
    }

    @PostMapping("/{id}/password")
    public Result<Boolean> changePassword(@PathVariable UUID id, @RequestBody Map<String, String> passwords) {
        String oldPassword = passwords.get("oldPassword");
        String newPassword = passwords.get("newPassword");
        return Result.success(userService.changePassword(id, oldPassword, newPassword));
    }
}
