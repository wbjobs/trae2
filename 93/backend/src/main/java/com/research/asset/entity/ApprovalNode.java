package com.research.asset.entity;

import com.research.asset.enums.NodeType;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "sys_approval_node")
public class ApprovalNode {
    @Id
    @GeneratedValue
    @Column(columnDefinition = "BINARY(16)")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "flow_id", nullable = false)
    private ApprovalFlow flow;

    @Column(nullable = false)
    private Integer nodeOrder;

    @Column(nullable = false, length = 50)
    private String nodeName;

    @Column(columnDefinition = "BINARY(16)")
    private UUID approverRoleId;

    @Column(columnDefinition = "BINARY(16)")
    private UUID approverId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NodeType nodeType;

    @Column(length = 512)
    private String conditionExpression;

    @Column(nullable = false)
    private Boolean isSkippable = false;

    @Column(nullable = false)
    private Boolean autoApprove = false;

    @Column(length = 512)
    private String autoApproveCondition;

    @Column(columnDefinition = "BINARY(16)")
    private UUID nextNodeId;

    @Column(columnDefinition = "TEXT")
    private String nextNodeIds;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
