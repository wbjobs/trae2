package com.doccollab.aspect;

import com.doccollab.annotation.AuditLog;
import com.doccollab.entity.AuditLog;
import com.doccollab.repository.AuditLogRepository;
import com.doccollab.security.CurrentUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.Method;
import java.time.LocalDateTime;

@Slf4j
@Aspect
@Component
public class AuditLogAspect {

    @Resource
    private AuditLogRepository auditLogRepository;

    @Resource
    private ObjectMapper objectMapper;

    @Around("@annotation(auditLog)")
    public Object around(ProceedingJoinPoint joinPoint, AuditLog auditLog) throws Throwable {
        long startTime = System.currentTimeMillis();
        HttpServletRequest request = getRequest();
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();

        CurrentUser currentUser = CurrentUser.get();

        AuditLog audit = new AuditLog();
        audit.setTenantId(currentUser != null ? currentUser.getTenantId() : null);
        audit.setUserId(currentUser != null ? currentUser.getUserId() : null);
        audit.setUsername(currentUser != null ? currentUser.getUsername() : null);
        audit.setModule(auditLog.module());
        audit.setOperation(auditLog.operation());
        audit.setMethod(method.getDeclaringClass().getName() + "." + method.getName());
        audit.setRequestUri(request != null ? request.getRequestURI() : null);
        audit.setRequestMethod(request != null ? request.getMethod() : null);
        audit.setIpAddress(request != null ? getClientIp(request) : null);
        audit.setUserAgent(request != null ? request.getHeader("User-Agent") : null);
        audit.setCreatedAt(LocalDateTime.now());

        if (auditLog.recordParams()) {
            try {
                audit.setParams(objectMapper.writeValueAsString(joinPoint.getArgs()));
            } catch (Exception e) {
                log.warn("Failed to serialize audit log params: {}", e.getMessage());
            }
        }

        Object result = null;
        try {
            result = joinPoint.proceed();
            audit.setStatus("SUCCESS");
            if (auditLog.recordResult() && result != null) {
                try {
                    audit.setResult(objectMapper.writeValueAsString(result));
                } catch (Exception e) {
                    log.warn("Failed to serialize audit log result: {}", e.getMessage());
                }
            }
            return result;
        } catch (Throwable e) {
            audit.setStatus("FAILURE");
            audit.setErrorMessage(e.getMessage());
            throw e;
        } finally {
            long duration = System.currentTimeMillis() - startTime;
            audit.setDurationMs(duration);
            saveAuditLog(audit);
        }
    }

    @Async
    protected void saveAuditLog(AuditLog auditLog) {
        try {
            auditLogRepository.save(auditLog);
        } catch (Exception e) {
            log.error("Failed to save audit log: {}", e.getMessage(), e);
        }
    }

    private HttpServletRequest getRequest() {
        try {
            ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            return attributes != null ? attributes.getRequest() : null;
        } catch (Exception e) {
            return null;
        }
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("WL-Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }
}
