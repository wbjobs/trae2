package com.doccollab.controller;

import com.doccollab.dto.AuditLogDTO;
import com.doccollab.dto.Result;
import com.doccollab.entity.AuditLog;
import com.doccollab.repository.AuditLogRepository;
import com.doccollab.security.CurrentUser;
import org.springframework.beans.BeanUtils;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/audit-logs")
public class AuditLogController {

    @Resource
    private AuditLogRepository auditLogRepository;

    @Resource
    private MongoTemplate mongoTemplate;

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public Result<List<AuditLogDTO>> getAuditLogs(
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startTime,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endTime,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        CurrentUser currentUser = CurrentUser.get();
        Query query = new Query();
        query.addCriteria(Criteria.where("tenantId").is(currentUser.getTenantId()));

        if (module != null && !module.isEmpty()) {
            query.addCriteria(Criteria.where("module").is(module));
        }
        if (userId != null && !userId.isEmpty()) {
            query.addCriteria(Criteria.where("userId").is(userId));
        }
        if (startTime != null && endTime != null) {
            query.addCriteria(Criteria.where("createdAt").gte(startTime).lte(endTime));
        } else if (startTime != null) {
            query.addCriteria(Criteria.where("createdAt").gte(startTime));
        } else if (endTime != null) {
            query.addCriteria(Criteria.where("createdAt").lte(endTime));
        }

        query.with(Sort.by(Sort.Direction.DESC, "createdAt"));
        query.skip((long) page * size).limit(size);

        List<AuditLog> logs = mongoTemplate.find(query, AuditLog.class);
        List<AuditLogDTO> dtos = logs.stream().map(this::convertToDTO).collect(Collectors.toList());
        return Result.success(dtos);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public Result<AuditLogDTO> getAuditLogById(@PathVariable String id) {
        CurrentUser currentUser = CurrentUser.get();
        AuditLog log = auditLogRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("日志不存在"));
        if (!log.getTenantId().equals(currentUser.getTenantId())) {
            throw new RuntimeException("无权限访问");
        }
        return Result.success(convertToDTO(log));
    }

    @GetMapping("/modules")
    @PreAuthorize("hasRole('ADMIN')")
    public Result<List<String>> getModules() {
        CurrentUser currentUser = CurrentUser.get();
        Query query = new Query();
        query.addCriteria(Criteria.where("tenantId").is(currentUser.getTenantId()));
        List<String> modules = mongoTemplate.query(AuditLog.class)
                .distinct("module")
                .as(String.class)
                .all();
        return Result.success(modules);
    }

    private AuditLogDTO convertToDTO(AuditLog auditLog) {
        AuditLogDTO dto = new AuditLogDTO();
        BeanUtils.copyProperties(auditLog, dto);
        return dto;
    }
}
