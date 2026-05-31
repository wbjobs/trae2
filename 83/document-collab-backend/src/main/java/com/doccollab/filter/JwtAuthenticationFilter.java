package com.doccollab.filter;

import com.doccollab.entity.User;
import com.doccollab.exception.BusinessException;
import com.doccollab.repository.UserRepository;
import com.doccollab.security.CurrentUser;
import com.doccollab.util.JwtUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private UserRepository userRepository;

    @Autowired(required = false)
    private RedisTemplate<String, Object> redisTemplate;

    @Value("${jwt.header}")
    private String header;

    private static final String USER_CACHE_PREFIX = "auth:user:";
    private static final long CACHE_TTL_SECONDS = 3600;

    private final ConcurrentHashMap<String, CachedUser> localCache = new ConcurrentHashMap<>();
    private static final long LOCAL_CACHE_TTL_MS = 60000;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        String authHeader = request.getHeader(header);

        if (authHeader != null && authHeader.startsWith(jwtUtil.getPrefix() + " ")) {
            String token = authHeader.substring(jwtUtil.getPrefix().length() + 1);

            try {
                if (jwtUtil.validateToken(token)) {
                    String userId = jwtUtil.getUserIdFromToken(token);
                    String tenantId = jwtUtil.getTenantIdFromToken(token);

                    String cacheKey = USER_CACHE_PREFIX + userId;
                    CachedUser cachedUser = getCachedUser(cacheKey);

                    User user;
                    if (cachedUser != null && cachedUser.getUser() != null) {
                        user = cachedUser.getUser();
                    } else {
                        user = userRepository.findById(userId).orElse(null);
                        if (user != null) {
                            cacheUser(cacheKey, user);
                        }
                    }

                    if (user != null && user.getStatus() == 1) {
                        if (user.getTenantId() == null || !user.getTenantId().equals(tenantId)) {
                            throw new BusinessException(401, "租户信息不匹配");
                        }

                        CurrentUser currentUser = new CurrentUser(
                                user.getId(),
                                user.getTenantId(),
                                user.getUsername(),
                                user.getEmail(),
                                user.getRole()
                        );
                        CurrentUser.set(currentUser);

                        UsernamePasswordAuthenticationToken authentication =
                                new UsernamePasswordAuthenticationToken(
                                        currentUser,
                                        null,
                                        Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + user.getRole()))
                                );
                        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                        SecurityContextHolder.getContext().setAuthentication(authentication);
                    }
                }
            } catch (Exception e) {
                log.debug("JWT authentication failed: {}", e.getMessage());
                SecurityContextHolder.clearContext();
                CurrentUser.clear();
            }
        }

        try {
            chain.doFilter(request, response);
        } finally {
            CurrentUser.clear();
        }
    }

    private CachedUser getCachedUser(String cacheKey) {
        CachedUser local = localCache.get(cacheKey);
        if (local != null && (System.currentTimeMillis() - local.getCachedAt()) < LOCAL_CACHE_TTL_MS) {
            return local;
        }

        if (redisTemplate != null) {
            try {
                User user = (User) redisTemplate.opsForValue().get(cacheKey);
                if (user != null) {
                    CachedUser cachedUser = new CachedUser(user, System.currentTimeMillis());
                    localCache.put(cacheKey, cachedUser);
                    return cachedUser;
                }
            } catch (Exception e) {
                log.warn("Redis cache read failed: {}", e.getMessage());
            }
        }

        return local;
    }

    private void cacheUser(String cacheKey, User user) {
        CachedUser cachedUser = new CachedUser(user, System.currentTimeMillis());
        localCache.put(cacheKey, cachedUser);

        if (redisTemplate != null) {
            try {
                redisTemplate.opsForValue().set(cacheKey, user, CACHE_TTL_SECONDS, TimeUnit.SECONDS);
            } catch (Exception e) {
                log.warn("Redis cache write failed: {}", e.getMessage());
            }
        }
    }

    private static class CachedUser {
        private final User user;
        private final long cachedAt;

        public CachedUser(User user, long cachedAt) {
            this.user = user;
            this.cachedAt = cachedAt;
        }

        public User getUser() {
            return user;
        }

        public long getCachedAt() {
            return cachedAt;
        }
    }
}
