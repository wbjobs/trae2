package com.doccollab.service.impl;

import com.doccollab.dto.LoginRequest;
import com.doccollab.dto.RegisterRequest;
import com.doccollab.dto.TokenResponse;
import com.doccollab.dto.UserDTO;
import com.doccollab.entity.Tenant;
import com.doccollab.entity.User;
import com.doccollab.exception.BusinessException;
import com.doccollab.repository.TenantRepository;
import com.doccollab.repository.UserRepository;
import com.doccollab.security.CurrentUser;
import com.doccollab.service.AuthService;
import com.doccollab.util.JwtUtil;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class AuthServiceImpl implements AuthService {

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtUtil jwtUtil;

    @Override
    public TokenResponse register(RegisterRequest request) {
        if (tenantRepository.existsByTenantId(request.getTenantId())) {
            throw new BusinessException(400, "租户ID已存在");
        }

        if (tenantRepository.existsByEmail(request.getEmail())) {
            throw new BusinessException(400, "邮箱已被注册");
        }

        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BusinessException(400, "邮箱已被注册");
        }

        if (userRepository.existsByTenantIdAndUsername(request.getTenantId(), request.getUsername())) {
            throw new BusinessException(400, "用户名已存在");
        }

        LocalDateTime now = LocalDateTime.now();

        Tenant tenant = new Tenant();
        tenant.setTenantId(request.getTenantId());
        tenant.setTenantName(request.getTenantName());
        tenant.setEmail(request.getEmail());
        tenant.setPassword(passwordEncoder.encode(request.getPassword()));
        tenant.setStatus(1);
        tenant.setCreatedAt(now);
        tenant.setUpdatedAt(now);
        tenant = tenantRepository.save(tenant);

        User user = new User();
        user.setTenantId(tenant.getTenantId());
        user.setUsername(request.getUsername());
        user.setEmail(request.getEmail());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setRole("ADMIN");
        user.setStatus(1);
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        user = userRepository.save(user);

        String token = jwtUtil.generateToken(user.getId(), user.getTenantId());
        UserDTO userDTO = convertToUserDTO(user);

        return new TokenResponse(token, jwtUtil.getPrefix(), jwtUtil.getExpiration(), userDTO);
    }

    @Override
    public TokenResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BusinessException(401, "邮箱或密码错误"));

        if (user.getStatus() != 1) {
            throw new BusinessException(401, "用户已被禁用");
        }

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BusinessException(401, "邮箱或密码错误");
        }

        String token = jwtUtil.generateToken(user.getId(), user.getTenantId());
        UserDTO userDTO = convertToUserDTO(user);

        return new TokenResponse(token, jwtUtil.getPrefix(), jwtUtil.getExpiration(), userDTO);
    }

    @Override
    public boolean hasPermission(String permission) {
        CurrentUser currentUser = CurrentUser.get();
        if (currentUser == null) {
            return false;
        }
        return "ADMIN".equals(currentUser.getRole());
    }

    @Override
    public boolean isAdmin() {
        CurrentUser currentUser = CurrentUser.get();
        if (currentUser == null) {
            return false;
        }
        return "ADMIN".equals(currentUser.getRole());
    }

    private UserDTO convertToUserDTO(User user) {
        UserDTO userDTO = new UserDTO();
        BeanUtils.copyProperties(user, userDTO);
        return userDTO;
    }
}
