package com.research.asset.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.research.asset.dto.ApprovalInstanceDTO;
import com.research.asset.dto.ApprovalLogDTO;
import com.research.asset.dto.ApprovalPathDTO;
import com.research.asset.dto.ApprovalProcessDTO;
import com.research.asset.dto.ApprovalSubmitDTO;
import com.research.asset.dto.PageResult;
import com.research.asset.entity.ApprovalFlow;
import com.research.asset.entity.ApprovalInstance;
import com.research.asset.entity.ApprovalLog;
import com.research.asset.entity.ApprovalNode;
import com.research.asset.entity.Asset;
import com.research.asset.entity.Role;
import com.research.asset.entity.User;
import com.research.asset.enums.ApprovalAction;
import com.research.asset.enums.ApprovalResult;
import com.research.asset.enums.FlowType;
import com.research.asset.enums.InstanceStatus;
import com.research.asset.enums.NodeType;
import com.research.asset.repository.ApprovalFlowRepository;
import com.research.asset.repository.ApprovalInstanceRepository;
import com.research.asset.repository.ApprovalLogRepository;
import com.research.asset.repository.ApprovalNodeRepository;
import com.research.asset.repository.AssetRepository;
import com.research.asset.repository.RoleRepository;
import com.research.asset.repository.UserRepository;
import jakarta.annotation.PostConstruct;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ApprovalService {

    private final ApprovalFlowRepository approvalFlowRepository;
    private final ApprovalNodeRepository approvalNodeRepository;
    private final ApprovalInstanceRepository approvalInstanceRepository;
    private final ApprovalLogRepository approvalLogRepository;
    private final AssetRepository assetRepository;
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final ApprovalConditionEvaluator conditionEvaluator;
    private final ApprovalFlowBuilder flowBuilder;
    private final ObjectMapper objectMapper;

    @PostConstruct
    @Transactional
    public void initDefaultFlows() {
        if (approvalFlowRepository.count() == 0) {
            initArchiveFlow();
            initBorrowFlow();
            initGenericTwoLevelFlow();
        }
    }

    private void initArchiveFlow() {
        UUID deptAdminRoleId = UUID.fromString("00000000-0000-0000-0000-000000000003");

        flowBuilder.name("归档审批流程")
                .type(FlowType.ARCHIVE)
                .description("归档审批：申请人 -> 部门主管 -> 档案管理员")
                .start("发起申请")
                    .autoApprove()
                .then("部门主管审批")
                    .approverRole(deptAdminRoleId)
                .then("档案管理员审批")
                .end()
                .build();
    }

    private void initBorrowFlow() {
        UUID deptAdminRoleId = UUID.fromString("00000000-0000-0000-0000-000000000003");
        UUID superAdminRoleId = UUID.fromString("00000000-0000-0000-0000-000000000001");

        flowBuilder.name("借阅审批流程")
                .type(FlowType.BORROW)
                .description("借阅审批：申请人 -> 部门主管（金额>5000需总监）")
                .start("发起申请")
                    .autoApprove()
                .then("部门主管审批")
                    .approverRole(deptAdminRoleId)
                    .when("${asset.amount} <= 5000")
                .then("总监审批")
                    .approverRole(superAdminRoleId)
                    .when("${asset.amount} > 5000")
                .end()
                .build();
    }

    private void initGenericTwoLevelFlow() {
        UUID deptAdminRoleId = UUID.fromString("00000000-0000-0000-0000-000000000003");
        UUID superAdminRoleId = UUID.fromString("00000000-0000-0000-0000-000000000001");

        flowBuilder.name("通用二级审批")
                .type(FlowType.REVOKE)
                .description("通用二级审批：部门主管 -> 分管领导")
                .start("发起申请")
                    .autoApprove()
                .then("部门主管审批")
                    .approverRole(deptAdminRoleId)
                .then("分管领导审批")
                    .approverRole(superAdminRoleId)
                .end()
                .build();
    }

    @Transactional
    public ApprovalFlow createFlow(ApprovalFlow flow, List<ApprovalNode> nodes) {
        flow = approvalFlowRepository.save(flow);
        int order = 1;
        ApprovalNode prev = null;
        for (ApprovalNode node : nodes) {
            node.setFlow(flow);
            node.setNodeOrder(order++);
            if (prev != null) {
                prev.setNextNodeId(node.getId());
                approvalNodeRepository.save(prev);
            }
            node = approvalNodeRepository.save(node);
            prev = node;
        }
        return flow;
    }

    @Transactional
    public ApprovalFlow createFlowWithBuilder(ApprovalFlowBuilder.FlowBuilderDTO dto) {
        flowBuilder.name(dto.getFlowName())
                .type(FlowType.valueOf(dto.getFlowType()))
                .description(dto.getDescription());

        if (dto.getNodes() != null && !dto.getNodes().isEmpty()) {
            for (int i = 0; i < dto.getNodes().size(); i++) {
                ApprovalFlowBuilder.NodeDTO nodeDTO = dto.getNodes().get(i);
                ApprovalFlowBuilder.NodeBuilder nodeBuilder;

                if (i == 0) {
                    nodeBuilder = flowBuilder.start(nodeDTO.getNodeName());
                } else {
                    nodeBuilder = flowBuilder.then(nodeDTO.getNodeName());
                }

                if (nodeDTO.getNodeType() != null) {
                    // nodeType is already set by start/then
                }
                if (nodeDTO.getApproverRoleId() != null) {
                    nodeBuilder.approverRole(UUID.fromString(nodeDTO.getApproverRoleId()));
                }
                if (nodeDTO.getApproverId() != null) {
                    nodeBuilder.approver(UUID.fromString(nodeDTO.getApproverId()));
                }
                if (nodeDTO.getConditionExpression() != null) {
                    nodeBuilder.when(nodeDTO.getConditionExpression());
                }
                if (nodeDTO.getIsSkippable() != null && nodeDTO.getIsSkippable()) {
                    nodeBuilder.skippable();
                }
                if (nodeDTO.getAutoApprove() != null && nodeDTO.getAutoApprove()) {
                    nodeBuilder.autoApprove(nodeDTO.getAutoApproveCondition());
                }
            }
        }

        return flowBuilder.build();
    }

    @Transactional
    public ApprovalInstanceDTO submitApproval(ApprovalSubmitDTO dto, UUID initiatorId) {
        Asset asset = assetRepository.findById(dto.getAssetId())
                .orElseThrow(() -> new EntityNotFoundException("资产不存在"));
        FlowType flowType = FlowType.valueOf(dto.getFlowType());
        ApprovalFlow flow = approvalFlowRepository.findByFlowType(flowType)
                .orElseThrow(() -> new EntityNotFoundException("审批流程不存在"));

        List<ApprovalNode> nodes = approvalNodeRepository.findByFlowIdOrderByNodeOrderAsc(flow.getId());
        if (nodes.isEmpty()) {
            throw new IllegalStateException("审批流程没有配置节点");
        }

        ApprovalNode startNode = nodes.get(0);

        ApprovalInstance instance = new ApprovalInstance();
        instance.setFlow(flow);
        instance.setAsset(asset);
        instance.setInitiatorId(initiatorId);
        instance.setCurrentNodeOrder(startNode.getNodeOrder());
        instance.setCurrentNodeId(startNode.getId());
        instance.setStatus(InstanceStatus.PENDING);
        instance.setContext(buildContextJson(asset, initiatorId));
        instance.setApprovalPath("[]");

        List<UUID> nextNodeIds = findNextNodes(instance, startNode, ApprovalResult.AUTO_APPROVED);
        instance.setNextNodeIds(serializeIds(nextNodeIds));

        instance = approvalInstanceRepository.save(instance);

        processAutoApprove(instance, startNode);

        return convertToDTO(instance);
    }

    private void processAutoApprove(ApprovalInstance instance, ApprovalNode node) {
        if (checkAutoApprove(node, instance)) {
            log.info("节点 [{}] 满足自动审批条件，自动通过", node.getNodeName());

            ApprovalLog autoLog = new ApprovalLog();
            autoLog.setInstance(instance);
            autoLog.setNode(node);
            autoLog.setApproverId(instance.getInitiatorId());
            autoLog.setAction(ApprovalAction.APPROVE);
            autoLog.setComment("系统自动审批");
            approvalLogRepository.save(autoLog);

            addToApprovalPath(instance, node, ApprovalResult.AUTO_APPROVED, "系统自动审批", instance.getInitiatorId());

            List<UUID> nextNodeIds = findNextNodes(instance, node, ApprovalResult.AUTO_APPROVED);

            if (nextNodeIds.isEmpty()) {
                instance.setStatus(InstanceStatus.APPROVED);
                instance.setCompletedAt(LocalDateTime.now());
                approvalInstanceRepository.save(instance);
                return;
            }

            ApprovalNode nextNode = approvalNodeRepository.findById(nextNodeIds.get(0)).orElse(null);
            if (nextNode != null) {
                instance.setCurrentNodeId(nextNode.getId());
                instance.setCurrentNodeOrder(nextNode.getNodeOrder());
                instance.setNextNodeIds(serializeIds(nextNodeIds.subList(1, nextNodeIds.size())));
                approvalInstanceRepository.save(instance);

                processAutoApprove(instance, nextNode);
            }
        }
    }

    @Transactional
    public ApprovalInstanceDTO processApproval(ApprovalProcessDTO dto, UUID approverId) {
        ApprovalInstance instance = approvalInstanceRepository.findById(dto.getInstanceId())
                .orElseThrow(() -> new EntityNotFoundException("审批实例不存在"));

        if (instance.getStatus() != InstanceStatus.PENDING) {
            throw new IllegalStateException("审批实例状态不是处理中");
        }

        ApprovalAction action = ApprovalAction.valueOf(dto.getAction());
        ApprovalNode currentNode = approvalNodeRepository.findById(instance.getCurrentNodeId())
                .orElseThrow(() -> new EntityNotFoundException("当前审批节点不存在"));

        if (!isValidApprover(currentNode, approverId)) {
            throw new SecurityException("您没有权限处理此审批");
        }

        ApprovalResult result = mapActionToResult(action);

        ApprovalLog log = new ApprovalLog();
        log.setInstance(instance);
        log.setNode(currentNode);
        log.setApproverId(approverId);
        log.setAction(action);
        log.setComment(dto.getComment());
        approvalLogRepository.save(log);

        addToApprovalPath(instance, currentNode, result, dto.getComment(), approverId);

        if (result == ApprovalResult.REJECTED) {
            instance.setStatus(InstanceStatus.REJECTED);
            instance.setCompletedAt(LocalDateTime.now());
            approvalInstanceRepository.save(instance);
            return convertToDTO(instance);
        }

        if (result == ApprovalResult.TRANSFERRED) {
            return convertToDTO(instance);
        }

        List<UUID> nextNodeIds = findNextNodes(instance, currentNode, result);

        if (nextNodeIds.isEmpty()) {
            instance.setStatus(InstanceStatus.APPROVED);
            instance.setCompletedAt(LocalDateTime.now());
            approvalInstanceRepository.save(instance);
            return convertToDTO(instance);
        }

        ApprovalNode nextNode = approvalNodeRepository.findById(nextNodeIds.get(0))
                .orElseThrow(() -> new EntityNotFoundException("下一节点不存在"));

        instance.setCurrentNodeId(nextNode.getId());
        instance.setCurrentNodeOrder(nextNode.getNodeOrder());
        instance.setNextNodeIds(serializeIds(nextNodeIds.subList(1, nextNodeIds.size())));

        instance = approvalInstanceRepository.save(instance);

        processAutoApprove(instance, nextNode);

        return convertToDTO(instance);
    }

    private List<UUID> findNextNodes(ApprovalInstance instance, ApprovalNode currentNode, ApprovalResult result) {
        List<UUID> nextNodes = new ArrayList<>();

        if (result == ApprovalResult.REJECTED) {
            return nextNodes;
        }

        List<ApprovalNode> allNodes = approvalNodeRepository.findByFlowIdOrderByNodeOrderAsc(instance.getFlow().getId());
        int currentIndex = -1;
        for (int i = 0; i < allNodes.size(); i++) {
            if (allNodes.get(i).getId().equals(currentNode.getId())) {
                currentIndex = i;
                break;
            }
        }

        if (currentIndex == -1 || currentIndex >= allNodes.size() - 1) {
            return nextNodes;
        }

        for (int i = currentIndex + 1; i < allNodes.size(); i++) {
            ApprovalNode node = allNodes.get(i);
            String condition = node.getConditionExpression();

            if (condition == null || condition.trim().isEmpty()) {
                nextNodes.add(node.getId());
                break;
            }

            try {
                if (conditionEvaluator.evaluate(condition, instance)) {
                    nextNodes.add(node.getId());
                    break;
                }
            } catch (Exception e) {
                log.warn("条件表达式解析失败 [{}]: {}", condition, e.getMessage());
            }
        }

        return nextNodes;
    }

    private boolean checkAutoApprove(ApprovalNode node, ApprovalInstance instance) {
        if (!Boolean.TRUE.equals(node.getAutoApprove())) {
            return false;
        }

        String condition = node.getAutoApproveCondition();
        if (condition == null || condition.trim().isEmpty()) {
            return true;
        }

        try {
            return conditionEvaluator.evaluate(condition, instance);
        } catch (Exception e) {
            log.warn("自动审批条件解析失败 [{}]: {}", condition, e.getMessage());
            return false;
        }
    }

    public List<ApprovalPathDTO> getApprovalPath(UUID instanceId) {
        ApprovalInstance instance = approvalInstanceRepository.findById(instanceId)
                .orElseThrow(() -> new EntityNotFoundException("审批实例不存在"));

        List<ApprovalNode> allNodes = approvalNodeRepository.findByFlowIdOrderByNodeOrderAsc(instance.getFlow().getId());
        List<ApprovalPathDTO> path = new ArrayList<>();
        List<Map<String, Object>> approvedPath = deserializePath(instance.getApprovalPath());
        Map<UUID, Map<String, Object>> pathMap = new HashMap<>();
        for (Map<String, Object> item : approvedPath) {
            UUID nodeId = UUID.fromString((String) item.get("nodeId"));
            pathMap.put(nodeId, item);
        }

        for (ApprovalNode node : allNodes) {
            ApprovalPathDTO dto = new ApprovalPathDTO();
            dto.setNodeId(node.getId());
            dto.setNodeName(node.getNodeName());
            dto.setNodeOrder(node.getNodeOrder());
            dto.setConditionExpression(node.getConditionExpression());
            dto.setIsSkippable(node.getIsSkippable());

            Map<String, Object> approved = pathMap.get(node.getId());
            if (approved != null) {
                dto.setResult((String) approved.get("result"));
                dto.setComment((String) approved.get("comment"));
                dto.setTime(LocalDateTime.parse((String) approved.get("time")));
                UUID approverId = UUID.fromString((String) approved.get("approverId"));
                dto.setApproverId(approverId);
                User approver = userRepository.findById(approverId).orElse(null);
                if (approver != null) {
                    dto.setApproverName(approver.getRealName());
                }
                dto.setIsCompleted(true);
                dto.setIsCurrent(false);
            } else if (node.getId().equals(instance.getCurrentNodeId())) {
                dto.setIsCurrent(true);
                dto.setIsCompleted(false);
                dto.setApproverName(getApproverDisplayName(node));
            } else {
                dto.setIsCurrent(false);
                dto.setIsCompleted(false);
                dto.setApproverName(getApproverDisplayName(node));
            }

            path.add(dto);
        }

        return path;
    }

    private String getApproverDisplayName(ApprovalNode node) {
        if (node.getApproverId() != null) {
            User user = userRepository.findById(node.getApproverId()).orElse(null);
            if (user != null) {
                return user.getRealName();
            }
        }
        if (node.getApproverRoleId() != null) {
            Role role = roleRepository.findById(node.getApproverRoleId()).orElse(null);
            if (role != null) {
                return role.getRoleName() + " (角色)";
            }
        }
        return "待定";
    }

    public List<ApprovalFlow> getSimpleFlows() {
        return approvalFlowRepository.findAll();
    }

    @Transactional
    public void simplify(UUID flowId, String initiatorDepartment) {
        ApprovalFlow flow = approvalFlowRepository.findById(flowId)
                .orElseThrow(() -> new EntityNotFoundException("审批流程不存在"));

        approvalNodeRepository.deleteByFlowId(flowId);

        List<Role> roles = roleRepository.findAllByOrderByLevelAsc();
        int order = 1;
        ApprovalNode prev = null;

        ApprovalNode startNode = new ApprovalNode();
        startNode.setFlow(flow);
        startNode.setNodeOrder(order++);
        startNode.setNodeName("发起申请");
        startNode.setNodeType(NodeType.SINGLE);
        startNode.setAutoApprove(true);
        startNode = approvalNodeRepository.save(startNode);
        prev = startNode;

        for (Role role : roles) {
            if (role.getLevel() == 0 || role.getLevel() >= 10) {
                continue;
            }

            ApprovalNode node = new ApprovalNode();
            node.setFlow(flow);
            node.setNodeOrder(order++);
            node.setNodeName(role.getRoleName() + "审批");
            node.setNodeType(NodeType.SINGLE);
            node.setApproverRoleId(role.getId());
            node = approvalNodeRepository.save(node);

            if (prev != null) {
                prev.setNextNodeId(node.getId());
                approvalNodeRepository.save(prev);
            }
            prev = node;
        }
    }

    public PageResult<ApprovalInstanceDTO> getMyApprovals(UUID userId, int pageNum, int pageSize) {
        Pageable pageable = PageRequest.of(pageNum - 1, pageSize, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<ApprovalInstance> page = approvalInstanceRepository.findByInitiatorIdOrderByCreatedAtDesc(userId, pageable);
        List<ApprovalInstanceDTO> dtoList = page.getContent().stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
        return PageResult.of(page.getTotal(), pageNum, pageSize, dtoList);
    }

    public PageResult<ApprovalInstanceDTO> getPendingApprovals(UUID approverId, int pageNum, int pageSize) {
        Pageable pageable = PageRequest.of(pageNum - 1, pageSize, Sort.by(Sort.Direction.DESC, "createdAt"));
        User user = userRepository.findByIdWithRoles(approverId)
                .orElseThrow(() -> new EntityNotFoundException("用户不存在"));
        List<UUID> roleIds = user.getRoles().stream()
                .map(Role::getId)
                .collect(Collectors.toList());
        Page<ApprovalInstance> page = approvalInstanceRepository.findPendingApprovals(approverId, roleIds, pageable);
        List<ApprovalInstanceDTO> dtoList = page.getContent().stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
        return PageResult.of(page.getTotal(), pageNum, pageSize, dtoList);
    }

    public ApprovalInstanceDTO getApprovalDetail(UUID instanceId) {
        ApprovalInstance instance = approvalInstanceRepository.findById(instanceId)
                .orElseThrow(() -> new EntityNotFoundException("审批实例不存在"));
        return convertToDTO(instance);
    }

    public List<ApprovalLogDTO> getApprovalLogs(UUID instanceId) {
        List<ApprovalLog> logs = approvalLogRepository.findByInstanceIdOrderByCreatedAtDesc(instanceId);
        return logs.stream()
                .map(this::convertToLogDTO)
                .collect(Collectors.toList());
    }

    public List<ApprovalFlow> getAllFlows() {
        return approvalFlowRepository.findAll();
    }

    @Transactional
    public void cancelApproval(UUID instanceId) {
        ApprovalInstance instance = approvalInstanceRepository.findById(instanceId)
                .orElseThrow(() -> new EntityNotFoundException("审批实例不存在"));
        instance.setStatus(InstanceStatus.CANCELLED);
        instance.setCompletedAt(LocalDateTime.now());
        approvalInstanceRepository.save(instance);
    }

    private boolean isValidApprover(ApprovalNode node, UUID approverId) {
        if (node.getApproverId() != null) {
            return node.getApproverId().equals(approverId);
        }

        if (node.getApproverRoleId() != null) {
            User user = userRepository.findByIdWithRoles(approverId).orElse(null);
            if (user != null) {
                return user.getRoles().stream()
                        .anyMatch(r -> r.getId().equals(node.getApproverRoleId()));
            }
        }

        return false;
    }

    private ApprovalResult mapActionToResult(ApprovalAction action) {
        switch (action) {
            case APPROVE:
                return ApprovalResult.APPROVED;
            case REJECT:
                return ApprovalResult.REJECTED;
            case TRANSFER:
                return ApprovalResult.TRANSFERRED;
            default:
                return ApprovalResult.APPROVED;
        }
    }

    private String buildContextJson(Asset asset, UUID initiatorId) {
        try {
            Map<String, Object> context = new HashMap<>();
            Map<String, Object> assetMap = new HashMap<>();
            assetMap.put("id", asset.getId());
            assetMap.put("type", asset.getAssetType() != null ? asset.getAssetType().name() : null);
            assetMap.put("amount", asset.getVersion());
            assetMap.put("title", asset.getTitle());
            assetMap.put("department", asset.getDepartment());
            context.put("asset", assetMap);
            context.put("initiatorId", initiatorId);
            return objectMapper.writeValueAsString(context);
        } catch (Exception e) {
            return "{}";
        }
    }

    private void addToApprovalPath(ApprovalInstance instance, ApprovalNode node, ApprovalResult result, String comment, UUID approverId) {
        try {
            List<Map<String, Object>> path = deserializePath(instance.getApprovalPath());
            Map<String, Object> item = new HashMap<>();
            item.put("nodeId", node.getId().toString());
            item.put("result", result.name());
            item.put("comment", comment);
            item.put("time", LocalDateTime.now().toString());
            item.put("approverId", approverId.toString());
            path.add(item);
            instance.setApprovalPath(objectMapper.writeValueAsString(path));
        } catch (Exception e) {
            log.warn("更新审批路径失败", e);
        }
    }

    private List<Map<String, Object>> deserializePath(String pathJson) {
        if (pathJson == null || pathJson.trim().isEmpty()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(pathJson, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private String serializeIds(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return "[]";
        }
        try {
            return objectMapper.writeValueAsString(ids.stream().map(UUID::toString).collect(Collectors.toList()));
        } catch (Exception e) {
            return "[]";
        }
    }

    private List<UUID> deserializeIds(String idsJson) {
        if (idsJson == null || idsJson.trim().isEmpty()) {
            return Collections.emptyList();
        }
        try {
            List<String> strIds = objectMapper.readValue(idsJson, new TypeReference<List<String>>() {});
            return strIds.stream().map(UUID::fromString).collect(Collectors.toList());
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    private ApprovalInstanceDTO convertToDTO(ApprovalInstance instance) {
        ApprovalInstanceDTO dto = new ApprovalInstanceDTO();
        dto.setId(instance.getId());
        dto.setFlowName(instance.getFlow().getFlowName());
        dto.setFlowType(instance.getFlow().getFlowType().name());
        dto.setAssetId(instance.getAsset().getId());
        dto.setAssetTitle(instance.getAsset().getTitle());
        dto.setCurrentNodeOrder(instance.getCurrentNodeOrder());
        dto.setStatus(instance.getStatus().name());
        dto.setCreatedAt(instance.getCreatedAt());
        dto.setCompletedAt(instance.getCompletedAt());

        User initiator = userRepository.findById(instance.getInitiatorId()).orElse(null);
        if (initiator != null) {
            dto.setInitiatorName(initiator.getRealName());
        }

        if (instance.getCurrentNodeId() != null) {
            ApprovalNode currentNode = approvalNodeRepository.findById(instance.getCurrentNodeId()).orElse(null);
            if (currentNode != null) {
                dto.setCurrentNodeName(currentNode.getNodeName());
            }
        }

        return dto;
    }

    private ApprovalLogDTO convertToLogDTO(ApprovalLog log) {
        ApprovalLogDTO dto = new ApprovalLogDTO();
        dto.setId(log.getId());
        dto.setNodeName(log.getNode().getNodeName());
        dto.setAction(log.getAction().name());
        dto.setComment(log.getComment());
        dto.setCreatedAt(log.getCreatedAt());

        User approver = userRepository.findById(log.getApproverId()).orElse(null);
        if (approver != null) {
            dto.setApproverName(approver.getRealName());
        }

        return dto;
    }
}
