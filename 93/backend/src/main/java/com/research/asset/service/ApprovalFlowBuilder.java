package com.research.asset.service;

import com.research.asset.entity.ApprovalFlow;
import com.research.asset.entity.ApprovalNode;
import com.research.asset.enums.FlowType;
import com.research.asset.enums.NodeType;
import com.research.asset.repository.ApprovalFlowRepository;
import com.research.asset.repository.ApprovalNodeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class ApprovalFlowBuilder {

    private final ApprovalFlowRepository flowRepository;
    private final ApprovalNodeRepository nodeRepository;

    private String flowName;
    private FlowType flowType;
    private String description;
    private final List<NodeBuilder> nodeBuilders = new ArrayList<>();

    public static ApprovalFlowBuilder create() {
        return new ApprovalFlowBuilder(null, null);
    }

    public ApprovalFlowBuilder(ApprovalFlowRepository flowRepository, ApprovalNodeRepository nodeRepository) {
        this.flowRepository = flowRepository;
        this.nodeRepository = nodeRepository;
    }

    public ApprovalFlowBuilder name(String flowName) {
        this.flowName = flowName;
        return this;
    }

    public ApprovalFlowBuilder type(FlowType flowType) {
        this.flowType = flowType;
        return this;
    }

    public ApprovalFlowBuilder description(String description) {
        this.description = description;
        return this;
    }

    public NodeBuilder start() {
        return start("开始");
    }

    public NodeBuilder start(String nodeName) {
        NodeBuilder builder = new NodeBuilder(this, nodeName, NodeType.SINGLE);
        nodeBuilders.add(builder);
        return builder;
    }

    @Transactional
    public ApprovalFlow build() {
        if (flowName == null || flowType == null) {
            throw new IllegalStateException("流程名称和类型不能为空");
        }

        ApprovalFlow flow = new ApprovalFlow();
        flow.setFlowName(flowName);
        flow.setFlowType(flowType);
        flow.setDescription(description);
        flow = flowRepository.save(flow);

        int order = 1;
        ApprovalNode previousNode = null;

        for (int i = 0; i < nodeBuilders.size(); i++) {
            NodeBuilder nb = nodeBuilders.get(i);
            ApprovalNode node = nb.build();
            node.setFlow(flow);
            node.setNodeOrder(order++);
            node = nodeRepository.save(node);

            if (previousNode != null) {
                previousNode.setNextNodeId(node.getId());
                nodeRepository.save(previousNode);
            }

            previousNode = node;
        }

        reset();
        return flow;
    }

    private void reset() {
        this.flowName = null;
        this.flowType = null;
        this.description = null;
        this.nodeBuilders.clear();
    }

    public static class NodeBuilder {
        private final ApprovalFlowBuilder parent;
        private final String nodeName;
        private final NodeType nodeType;
        private UUID approverRoleId;
        private UUID approverId;
        private String conditionExpression;
        private Boolean isSkippable = false;
        private Boolean autoApprove = false;
        private String autoApproveCondition;

        public NodeBuilder(ApprovalFlowBuilder parent, String nodeName, NodeType nodeType) {
            this.parent = parent;
            this.nodeName = nodeName;
            this.nodeType = nodeType;
        }

        public NodeBuilder approverRole(UUID roleId) {
            this.approverRoleId = roleId;
            return this;
        }

        public NodeBuilder approver(UUID userId) {
            this.approverId = userId;
            return this;
        }

        public NodeBuilder when(String condition) {
            this.conditionExpression = condition;
            return this;
        }

        public NodeBuilder skippable() {
            this.isSkippable = true;
            return this;
        }

        public NodeBuilder autoApprove() {
            this.autoApprove = true;
            return this;
        }

        public NodeBuilder autoApprove(String condition) {
            this.autoApprove = true;
            this.autoApproveCondition = condition;
            return this;
        }

        public NodeBuilder then(String nodeName) {
            return parent.then(nodeName);
        }

        public NodeBuilder then(String nodeName, NodeType type) {
            return parent.then(nodeName, type);
        }

        public ApprovalFlowBuilder end() {
            return parent;
        }

        public ApprovalNode build() {
            ApprovalNode node = new ApprovalNode();
            node.setNodeName(nodeName);
            node.setNodeType(nodeType);
            node.setApproverRoleId(approverRoleId);
            node.setApproverId(approverId);
            node.setConditionExpression(conditionExpression);
            node.setIsSkippable(isSkippable);
            node.setAutoApprove(autoApprove);
            node.setAutoApproveCondition(autoApproveCondition);
            return node;
        }
    }

    public NodeBuilder then(String nodeName) {
        return then(nodeName, NodeType.SINGLE);
    }

    public NodeBuilder then(String nodeName, NodeType type) {
        NodeBuilder builder = new NodeBuilder(this, nodeName, type);
        nodeBuilders.add(builder);
        return builder;
    }

    public NodeBuilder when(String condition) {
        if (nodeBuilders.isEmpty()) {
            throw new IllegalStateException("when() 必须在节点之后调用");
        }
        NodeBuilder last = nodeBuilders.get(nodeBuilders.size() - 1);
        return last.when(condition);
    }

    public static class FlowBuilderDTO {
        private String flowName;
        private String flowType;
        private String description;
        private List<NodeDTO> nodes;

        public String getFlowName() {
            return flowName;
        }

        public void setFlowName(String flowName) {
            this.flowName = flowName;
        }

        public String getFlowType() {
            return flowType;
        }

        public void setFlowType(String flowType) {
            this.flowType = flowType;
        }

        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
        }

        public List<NodeDTO> getNodes() {
            return nodes;
        }

        public void setNodes(List<NodeDTO> nodes) {
            this.nodes = nodes;
        }
    }

    public static class NodeDTO {
        private String nodeName;
        private String nodeType;
        private String approverRoleId;
        private String approverId;
        private String conditionExpression;
        private Boolean isSkippable;
        private Boolean autoApprove;
        private String autoApproveCondition;

        public String getNodeName() {
            return nodeName;
        }

        public void setNodeName(String nodeName) {
            this.nodeName = nodeName;
        }

        public String getNodeType() {
            return nodeType;
        }

        public void setNodeType(String nodeType) {
            this.nodeType = nodeType;
        }

        public String getApproverRoleId() {
            return approverRoleId;
        }

        public void setApproverRoleId(String approverRoleId) {
            this.approverRoleId = approverRoleId;
        }

        public String getApproverId() {
            return approverId;
        }

        public void setApproverId(String approverId) {
            this.approverId = approverId;
        }

        public String getConditionExpression() {
            return conditionExpression;
        }

        public void setConditionExpression(String conditionExpression) {
            this.conditionExpression = conditionExpression;
        }

        public Boolean getIsSkippable() {
            return isSkippable;
        }

        public void setIsSkippable(Boolean skippable) {
            isSkippable = skippable;
        }

        public Boolean getAutoApprove() {
            return autoApprove;
        }

        public void setAutoApprove(Boolean autoApprove) {
            this.autoApprove = autoApprove;
        }

        public String getAutoApproveCondition() {
            return autoApproveCondition;
        }

        public void setAutoApproveCondition(String autoApproveCondition) {
            this.autoApproveCondition = autoApproveCondition;
        }
    }
}
