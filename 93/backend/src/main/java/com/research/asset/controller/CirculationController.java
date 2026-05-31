package com.research.asset.controller;

import com.research.asset.dto.CirculationApplyDTO;
import com.research.asset.dto.CirculationDTO;
import com.research.asset.dto.PageResult;
import com.research.asset.dto.Result;
import com.research.asset.service.CirculationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/circulations")
@CrossOrigin
@RequiredArgsConstructor
public class CirculationController {

    private final CirculationService circulationService;
    private final HttpServletRequest request;

    private String getClientIp() {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    @PostMapping("/apply")
    public Result<CirculationDTO> applyBorrow(@Valid @RequestBody CirculationApplyDTO dto, @RequestHeader UUID userId) {
        try {
            return Result.success(circulationService.applyBorrow(dto, userId, getClientIp()));
        } catch (IllegalStateException e) {
            return Result.error(400, e.getMessage());
        }
    }

    @PutMapping("/{id}/approve")
    public Result<CirculationDTO> approveBorrow(@PathVariable UUID id, @RequestHeader UUID approverId) {
        try {
            return Result.success(circulationService.approveBorrow(id, approverId, getClientIp()));
        } catch (IllegalStateException e) {
            return Result.error(400, e.getMessage());
        }
    }

    @PutMapping("/{id}/reject")
    public Result<CirculationDTO> rejectBorrow(@PathVariable UUID id, @RequestHeader UUID approverId, @RequestBody Map<String, String> body) {
        try {
            String reason = body.getOrDefault("reason", "");
            return Result.success(circulationService.rejectBorrow(id, approverId, reason, getClientIp()));
        } catch (IllegalStateException e) {
            return Result.error(400, e.getMessage());
        }
    }

    @PutMapping("/{id}/return")
    public Result<CirculationDTO> returnAsset(@PathVariable UUID id, @RequestHeader UUID userId) {
        try {
            return Result.success(circulationService.returnAsset(id, userId, getClientIp()));
        } catch (IllegalStateException e) {
            return Result.error(400, e.getMessage());
        }
    }

    @GetMapping("/my")
    public Result<PageResult<CirculationDTO>> getMyRecords(@RequestHeader UUID userId, @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "10") int size) {
        return Result.success(circulationService.getMyBorrowRecords(userId, page, size));
    }

    @GetMapping
    public Result<PageResult<CirculationDTO>> getRecords(@RequestParam(required = false) String status, @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "10") int size) {
        return Result.success(circulationService.getBorrowRecordsByStatus(status, page, size));
    }

    @GetMapping("/{id}")
    public Result<CirculationDTO> getRecordById(@PathVariable UUID id) {
        return Result.success(circulationService.getBorrowRecordById(id));
    }
}
