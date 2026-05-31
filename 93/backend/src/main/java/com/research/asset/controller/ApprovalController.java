package com.research.asset.controller;

import com.research.asset.dto.ApprovalInstanceDTO;
import com.research.asset.dto.ApprovalLogDTO;
import com.research.asset.dto.ApprovalPathDTO;
import com.research.asset.dto.ApprovalProcessDTO;
import com.research.asset.dto.ApprovalSubmitDTO;
import com.research.asset.dto.PageResult;
import com.research.asset.dto.Result;
import com.research.asset.entity.ApprovalFlow;
import com.research.asset.service.ApprovalFlowBuilder;
import com.research.asset.service.ApprovalService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/approvals")
@CrossOrigin
@RequiredArgsConstructor
public class ApprovalController {

    private final ApprovalService approvalService;

    @PostMapping("/submit")
    public Result<ApprovalInstanceDTO> submitApproval(@Valid @RequestBody ApprovalSubmitDTO dto, @RequestHeader UUID userId) {
        return Result.success(approvalService.submitApproval(dto, userId));
    }

    @PostMapping("/process")
    public Result<ApprovalInstanceDTO> processApproval(@Valid @RequestBody ApprovalProcessDTO dto, @RequestHeader UUID userId) {
        return Result.success(approvalService.processApproval(dto, userId));
    }

    @GetMapping("/my")
    public Result<PageResult<ApprovalInstanceDTO>> getMyApprovals(@RequestHeader UUID userId, @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "10") int size) {
        return Result.success(approvalService.getMyApprovals(userId, page, size));
    }

    @GetMapping("/pending")
    public Result<PageResult<ApprovalInstanceDTO>> getPendingApprovals(@RequestHeader UUID userId, @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "10") int size) {
        return Result.success(approvalService.getPendingApprovals(userId, page, size));
    }

    @GetMapping("/{id}")
    public Result<ApprovalInstanceDTO> getApprovalDetail(@PathVariable UUID id) {
        return Result.success(approvalService.getApprovalDetail(id));
    }

    @GetMapping("/{id}/logs")
    public Result<List<ApprovalLogDTO>> getApprovalLogs(@PathVariable UUID id) {
        return Result.success(approvalService.getApprovalLogs(id));
    }

    @GetMapping("/{id}/path")
    public Result<List<ApprovalPathDTO>> getApprovalPath(@PathVariable UUID id) {
        return Result.success(approvalService.getApprovalPath(id));
    }

    @GetMapping("/flows")
    public Result<List<ApprovalFlow>> getAllFlows() {
        return Result.success(approvalService.getAllFlows());
    }

    @GetMapping("/flows/simple")
    public Result<List<ApprovalFlow>> getSimpleFlows() {
        return Result.success(approvalService.getSimpleFlows());
    }

    @PostMapping("/flows")
    public Result<ApprovalFlow> createFlow(@RequestBody ApprovalFlow flow) {
        return Result.success(approvalService.createFlow(flow, flow.getNodes()));
    }

    @PostMapping("/flows/builder")
    public Result<ApprovalFlow> createFlowWithBuilder(@RequestBody ApprovalFlowBuilder.FlowBuilderDTO dto) {
        return Result.success(approvalService.createFlowWithBuilder(dto));
    }

    @PutMapping("/flows/{id}/simplify")
    public Result<Void> simplifyFlow(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        String department = body.get("department");
        approvalService.simplify(id, department);
        return Result.success();
    }

    @DeleteMapping("/{id}/cancel")
    public Result<Void> cancelApproval(@PathVariable UUID id) {
        approvalService.cancelApproval(id);
        return Result.success();
    }
}
