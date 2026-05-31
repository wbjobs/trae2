package com.research.asset.entity;

import com.research.asset.enums.FlowType;
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
@Table(name = "sys_approval_flow")
public class ApprovalFlow {
    @Id
    @GeneratedValue
    @Column(columnDefinition = "BINARY(16)")
    private UUID id;

    @Column(nullable = false, length = 100)
    private String flowName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private FlowType flowType;

    @Column(length = 255)
    private String description;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "flow", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ApprovalNode> nodes;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
