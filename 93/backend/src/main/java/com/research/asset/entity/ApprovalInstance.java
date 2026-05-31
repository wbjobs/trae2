package com.research.asset.entity;

import com.research.asset.enums.InstanceStatus;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "sys_approval_instance")
public class ApprovalInstance {
    @Id
    @GeneratedValue
    @Column(columnDefinition = "BINARY(16)")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "flow_id", nullable = false)
    private ApprovalFlow flow;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "asset_id", nullable = false)
    private Asset asset;

    @Column(nullable = false, columnDefinition = "BINARY(16)")
    private UUID initiatorId;

    @Column(nullable = false)
    private Integer currentNodeOrder;

    @Column(columnDefinition = "BINARY(16)")
    private UUID currentNodeId;

    @Column(columnDefinition = "TEXT")
    private String nextNodeIds;

    @Column(columnDefinition = "TEXT")
    private String approvalPath;

    @Column(columnDefinition = "TEXT")
    private String context;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InstanceStatus status;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    private LocalDateTime completedAt;

    @OneToMany(mappedBy = "instance", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ApprovalLog> logs;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
