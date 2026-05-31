package com.doccollab.util;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

@Component
public class JwtUtil {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration}")
    private Long expiration;

    @Value("${jwt.prefix}")
    private String prefix;

    private final ConcurrentHashMap<String, CachedValidation> validationCache = new ConcurrentHashMap<>();
    private static final long VALIDATION_CACHE_MS = 5000;

    public String generateToken(String userId, String tenantId) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("tenantId", tenantId);
        claims.put("userId", userId);
        return createToken(claims, userId);
    }

    private String createToken(Map<String, Object> claims, String subject) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expiration);

        return Jwts.builder()
                .setClaims(claims)
                .setSubject(subject)
                .setIssuedAt(now)
                .setExpiration(expiryDate)
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    private Key getSigningKey() {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    public String getUserIdFromToken(String token) {
        return getClaimFromToken(token, Claims::getSubject);
    }

    public String getTenantIdFromToken(String token) {
        return getClaimFromToken(token, claims -> claims.get("tenantId", String.class));
    }

    public Date getExpirationDateFromToken(String token) {
        return getClaimFromToken(token, Claims::getExpiration);
    }

    public <T> T getClaimFromToken(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = getAllClaimsFromToken(token);
        return claimsResolver.apply(claims);
    }

    private Claims getAllClaimsFromToken(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    public Boolean isTokenExpired(String token) {
        final Date expiration = getExpirationDateFromToken(token);
        return expiration.before(new Date());
    }

    public Boolean validateToken(String token) {
        return (!isTokenExpired(token));
    }

    public Boolean validateTokenCached(String token) {
        CachedValidation cached = validationCache.get(token);
        if (cached != null && (System.currentTimeMillis() - cached.validatedAt) < VALIDATION_CACHE_MS) {
            return cached.result;
        }
        Boolean result = validateToken(token);
        validationCache.put(token, new CachedValidation(result, System.currentTimeMillis()));
        if (validationCache.size() > 1000) {
            validationCache.clear();
        }
        return result;
    }

    public Long getExpiration() {
        return expiration;
    }

    public String getPrefix() {
        return prefix;
    }

    private static class CachedValidation {
        final boolean result;
        final long validatedAt;

        CachedValidation(boolean result, long validatedAt) {
            this.result = result;
            this.validatedAt = validatedAt;
        }
    }
}
