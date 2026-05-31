import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpService } from '../core/http.service';
import { ModalComponent } from '../shared/components/modal.component';
import { PaginationComponent } from '../shared/components/pagination.component';
import { Router } from '@angular/router';

interface ApprovalInstance {
  id: string;
  assetTitle: string;
  assetCode: string;
  flowType: string;
  initiator: string;
  currentNode: string;
  submitTime: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  steps: ApprovalStep[];
}

interface ApprovalStep {
  nodeId: string;
  nodeName: string;
  approverId: string;
  approverName: string;
  result: string;
  comment: string;
  time: string;
  isCurrent: boolean;
  isCompleted: boolean;
  nodeOrder: number;
  conditionExpression: string;
  isSkippable: boolean;
}

interface ApprovalPathDTO {
  nodeId: string;
  nodeName: string;
  approverId: string;
  approverName: string;
  result: string;
  comment: string;
  time: string;
  isCurrent: boolean;
  isCompleted: boolean;
  nodeOrder: number;
  conditionExpression: string;
  isSkippable: boolean;
}

@Component({
  selector: 'app-approval',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, PaginationComponent],
  template: `
    <div class="approval-container">
      <div class="tabs-header">
        <button 
          *ngFor="let tab of tabs" 
          class="tab-item"
          [class.active]="activeTab === tab.key"
          (click)="activeTab = tab.key; loadList()"
        >
          {{ tab.label }}
        </button>
        <button class="btn btn-primary" (click)="goToFlowDesign()">流程设计</button>
      </div>

      <div class="table-card">
        <table class="approval-table">
          <thead>
            <tr>
              <th>资产</th>
              <th>流程类型</th>
              <th>发起人</th>
              <th>当前节点</th>
              <th>提交时间</th>
              <th>状态</th>
              <th width="180">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of list">
              <td>
                <div class="asset-info">
                  <span class="asset-code">{{ item.assetCode }}</span>
                  <span class="asset-title">{{ item.assetTitle }}</span>
                </div>
              </td>
              <td>{{ item.flowType }}</td>
              <td>{{ item.initiator }}</td>
              <td>
                <span class="node-badge">{{ item.currentNode }}</span>
              </td>
              <td>{{ item.submitTime }}</td>
              <td>
                <span class="status-badge" [ngClass]="getStatusClass(item.status)">{{ getStatusText(item.status) }}</span>
              </td>
              <td>
                <div class="action-buttons">
                  <button class="btn-text" (click)="viewDetail(item)">详情</button>
                  <ng-container *ngIf="item.status === 'pending' && activeTab === 'pending'">
                    <button class="btn-text btn-success-text" (click)="quickApprove(item)">同意</button>
                    <button class="btn-text btn-danger-text" (click)="quickReject(item)">驳回</button>
                  </ng-container>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <app-pagination 
        [total]="total"
        [pageNum]="pageNum"
        [pageSize]="pageSize"
        (pageChange)="handlePageChange($event)"
      ></app-pagination>
    </div>

    <app-modal 
      title="审批详情" 
      [(visible)]="detailModal"
      width="700px"
      (onConfirm)="handleDetailConfirm"
    >
      <div class="process-container">
        <div class="process-header">
          <div>
            <h4 class="process-title">{{ currentInstance?.assetTitle }}</h4>
            <div class="process-meta">
              <span class="process-type">{{ currentInstance?.flowType }}</span>
              <span class="process-submitter">发起人: {{ currentInstance?.initiator }}</span>
              <span class="process-time">提交时间: {{ currentInstance?.submitTime }}</span>
            </div>
          </div>
          <span class="status-badge" [ngClass]="getStatusClass(currentInstance?.status || '')">
            {{ getStatusText(currentInstance?.status || '') }}
          </span>
        </div>

        <div class="timeline">
          <div 
            class="timeline-item" 
            *ngFor="let step of currentInstance?.steps; let last = last"
            [class.last]="last"
            [class.current]="step.isCurrent"
          >
            <div class="timeline-dot" [ngClass]="getStepClass(step)"></div>
            <div class="timeline-line" *ngIf="!last"></div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="timeline-node">{{ step.nodeName }}</span>
                <span class="timeline-status" [ngClass]="getStepClass(step)">
                  {{ getStepStatusText(step) }}
                </span>
                <span *ngIf="step.conditionExpression" class="condition-badge" title="条件表达式">
                  ⚡ {{ step.conditionExpression }}
                </span>
                <span *ngIf="step.isSkippable" class="skip-badge" title="可跳过">
                  ⏭️ 可跳过
                </span>
              </div>
              <div class="timeline-approver">
                <span class="approver-label">审批人:</span>
                <span class="approver-value">{{ step.approverName || '待定' }}</span>
              </div>
              <div class="timeline-time" *ngIf="step.time">处理时间: {{ step.time }}</div>
              <div class="timeline-comment" *ngIf="step.comment">"{{ step.comment }}"</div>
            </div>
          </div>
        </div>

        <div class="process-form" *ngIf="currentInstance?.status === 'pending' && activeTab === 'pending'">
          <div class="form-row">
            <label class="form-label">审批意见</label>
            <textarea class="form-input textarea" [(ngModel)]="comment" placeholder="请输入审批意见"></textarea>
          </div>
          <div class="process-actions">
            <button class="btn btn-success" (click)="handleApprove()">同意</button>
            <button class="btn btn-danger" (click)="handleReject()">驳回</button>
            <button class="btn btn-secondary" (click)="handleTransfer()">转审</button>
          </div>
        </div>
      </div>
    </app-modal>

    <app-modal 
      title="确认审批" 
      [(visible)]="confirmModal"
      width="400px"
      (onConfirm)="executeQuickAction"
    >
      <div class="confirm-content">
        <p class="confirm-text">确定要{{ confirmActionText }}此审批吗？</p>
        <div class="form-row" *ngIf="confirmAction !== 'approve'">
          <label class="form-label">审批意见</label>
          <textarea class="form-input textarea" [(ngModel)]="quickComment" placeholder="请输入审批意见"></textarea>
        </div>
      </div>
    </app-modal>
  `,
  styles: [`
    .approval-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .tabs-header {
      background: white;
      padding: 0 20px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    .tab-item {
      padding: 16px 24px;
      border: none;
      background: none;
      font-size: 14px;
      color: #6b7280;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }
    .tab-item.active {
      color: #3b82f6;
      border-bottom-color: #3b82f6;
      font-weight: 600;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #3b82f6;
      color: white;
    }
    .btn-primary:hover {
      background: #2563eb;
    }
    .btn-success {
      background: #10b981;
      color: white;
    }
    .btn-success:hover {
      background: #059669;
    }
    .btn-danger {
      background: #ef4444;
      color: white;
    }
    .btn-danger:hover {
      background: #dc2626;
    }
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }
    .btn-secondary:hover {
      background: #e5e7eb;
    }
    .table-card {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    .approval-table {
      width: 100%;
      border-collapse: collapse;
    }
    .approval-table th,
    .approval-table td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #f3f4f6;
      font-size: 14px;
    }
    .approval-table th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
    }
    .approval-table tbody tr:hover {
      background: #f9fafb;
    }
    .asset-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .asset-code {
      font-size: 12px;
      color: #6b7280;
    }
    .asset-title {
      font-size: 14px;
      color: #111827;
    }
    .node-badge {
      padding: 4px 10px;
      background: #f3f4f6;
      border-radius: 4px;
      font-size: 12px;
      color: #374151;
    }
    .status-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .status-pending {
      background: #fef3c7;
      color: #d97706;
    }
    .status-approved {
      background: #d1fae5;
      color: #059669;
    }
    .status-rejected {
      background: #fee2e2;
      color: #dc2626;
    }
    .status-cancelled {
      background: #e5e7eb;
      color: #6b7280;
    }
    .action-buttons {
      display: flex;
      gap: 8px;
    }
    .btn-text {
      padding: 4px 8px;
      border: none;
      background: none;
      color: #3b82f6;
      cursor: pointer;
      font-size: 13px;
      border-radius: 4px;
    }
    .btn-text:hover {
      background: #eff6ff;
    }
    .btn-success-text {
      color: #10b981;
    }
    .btn-success-text:hover {
      background: #d1fae5;
    }
    .btn-danger-text {
      color: #ef4444;
    }
    .btn-danger-text:hover {
      background: #fee2e2;
    }
    .process-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .process-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding-bottom: 16px;
      border-bottom: 1px solid #f3f4f6;
    }
    .process-title {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
      color: #111827;
    }
    .process-meta {
      display: flex;
      gap: 16px;
      font-size: 13px;
      color: #6b7280;
    }
    .process-type {
      padding: 4px 12px;
      background: #eff6ff;
      color: #3b82f6;
      border-radius: 12px;
      font-size: 12px;
    }
    .timeline {
      position: relative;
      padding-left: 8px;
    }
    .timeline-item {
      position: relative;
      display: flex;
      padding-bottom: 24px;
    }
    .timeline-item.last {
      padding-bottom: 0;
    }
    .timeline-item.current {
      background: #f0f9ff;
      border-radius: 8px;
      margin: -8px;
      padding: 8px 8px 24px 8px;
    }
    .timeline-item.current.last {
      padding-bottom: 8px;
    }
    .timeline-dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #e5e7eb;
      position: relative;
      z-index: 1;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .timeline-dot.pending {
      background: #fbbf24;
    }
    .timeline-dot.approved {
      background: #10b981;
    }
    .timeline-dot.rejected {
      background: #ef4444;
    }
    .timeline-dot.auto_approved {
      background: #06b6d4;
    }
    .timeline-dot.current {
      background: #3b82f6;
      box-shadow: 0 0 0 4px #dbeafe;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 4px #dbeafe; }
      50% { box-shadow: 0 0 0 8px #dbeafe; }
    }
    .timeline-line {
      position: absolute;
      left: 7px;
      top: 16px;
      bottom: 0;
      width: 2px;
      background: #e5e7eb;
    }
    .timeline-content {
      margin-left: 16px;
      flex: 1;
    }
    .timeline-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
      flex-wrap: wrap;
    }
    .timeline-node {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
    }
    .timeline-status {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
    }
    .timeline-status.pending {
      background: #fef3c7;
      color: #d97706;
    }
    .timeline-status.approved {
      background: #d1fae5;
      color: #059669;
    }
    .timeline-status.rejected {
      background: #fee2e2;
      color: #dc2626;
    }
    .timeline-status.auto_approved {
      background: #cffafe;
      color: #0891b2;
    }
    .timeline-status.current {
      background: #dbeafe;
      color: #2563eb;
    }
    .condition-badge {
      padding: 2px 6px;
      background: #fef3c7;
      color: #92400e;
      border-radius: 4px;
      font-size: 11px;
    }
    .skip-badge {
      padding: 2px 6px;
      background: #e0e7ff;
      color: #4338ca;
      border-radius: 4px;
      font-size: 11px;
    }
    .timeline-approver {
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .approver-label {
      color: #9ca3af;
      margin-right: 4px;
    }
    .approver-value {
      color: #374151;
      font-weight: 500;
    }
    .timeline-time {
      font-size: 12px;
      color: #9ca3af;
      margin-bottom: 4px;
    }
    .timeline-comment {
      font-size: 13px;
      color: #374151;
      font-style: italic;
      padding: 8px 12px;
      background: #f9fafb;
      border-radius: 6px;
      margin-top: 4px;
      border-left: 3px solid #d1d5db;
    }
    .process-form {
      padding-top: 16px;
      border-top: 1px solid #f3f4f6;
    }
    .form-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 16px;
    }
    .form-label {
      font-size: 14px;
      font-weight: 500;
      color: #374151;
    }
    .form-input {
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
    }
    .form-input.textarea {
      min-height: 80px;
      resize: vertical;
    }
    .process-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    .confirm-content {
      padding: 10px 0;
    }
    .confirm-text {
      margin: 0 0 16px 0;
      font-size: 14px;
      color: #374151;
    }
  `]
})
export class ApprovalComponent implements OnInit {
  activeTab = 'pending';
  tabs = [
    { key: 'pending', label: '待审批' },
    { key: 'approved', label: '已审批' },
    { key: 'my', label: '我发起的' }
  ];

  list: ApprovalInstance[] = [];
  total = 0;
  pageNum = 1;
  pageSize = 10;

  detailModal = false;
  currentInstance: ApprovalInstance | null = null;
  comment = '';

  confirmModal = false;
  confirmAction: 'approve' | 'reject' = 'approve';
  confirmActionText = '';
  quickComment = '';
  quickInstance: ApprovalInstance | null = null;

  constructor(
    private httpService: HttpService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadList();
  }

  loadList(): void {
    const endpoint = this.activeTab === 'my' ? '/api/approvals/my' : '/api/approvals/pending';
    this.httpService.get<any>(`${endpoint}?page=${this.pageNum}&size=${this.pageSize}`)
      .subscribe({
        next: (res) => {
          if (res.code === 200 && res.data) {
            this.list = res.data.list || [];
            this.total = res.data.total || 0;
          }
        },
        error: () => {
          this.loadMockData();
        }
      });
  }

  loadMockData(): void {
    this.list = [
      {
        id: '1',
        assetTitle: '2024年度财务预算报告.pdf',
        assetCode: 'AST-2024-001',
        flowType: '归档审批',
        initiator: '张三',
        currentNode: '财务总监审批',
        submitTime: '2024-01-15 10:30',
        status: 'pending',
        steps: [
          { nodeId: '101', nodeName: '发起申请', approverId: '', approverName: '张三', result: 'AUTO_APPROVED', comment: '申请归档', time: '2024-01-15 10:30', isCurrent: false, isCompleted: true, nodeOrder: 1, conditionExpression: '', isSkippable: false },
          { nodeId: '102', nodeName: '部门主管审批', approverId: '', approverName: '王经理', result: 'APPROVED', comment: '同意', time: '2024-01-15 11:00', isCurrent: false, isCompleted: true, nodeOrder: 2, conditionExpression: '', isSkippable: false },
          { nodeId: '103', nodeName: '财务总监审批', approverId: '', approverName: '赵总监 (角色)', result: '', comment: '', time: '', isCurrent: true, isCompleted: false, nodeOrder: 3, conditionExpression: '', isSkippable: false }
        ]
      },
      {
        id: '2',
        assetTitle: '设备采购合同.docx',
        assetCode: 'AST-2024-002',
        flowType: '借阅审批',
        initiator: '李四',
        currentNode: '已完成',
        submitTime: '2024-01-12 09:00',
        status: 'approved',
        steps: [
          { nodeId: '201', nodeName: '发起申请', approverId: '', approverName: '李四', result: 'AUTO_APPROVED', comment: '借阅用于项目参考', time: '2024-01-12 09:00', isCurrent: false, isCompleted: true, nodeOrder: 1, conditionExpression: '', isSkippable: false },
          { nodeId: '202', nodeName: '部门主管审批', approverId: '', approverName: '王经理', result: 'APPROVED', comment: '同意', time: '2024-01-12 09:30', isCurrent: false, isCompleted: true, nodeOrder: 2, conditionExpression: '${asset.amount} <= 5000', isSkippable: false }
        ]
      },
      {
        id: '3',
        assetTitle: '技术方案设计文档.docx',
        assetCode: 'AST-2024-004',
        flowType: '归档审批',
        initiator: '王五',
        currentNode: '已驳回',
        submitTime: '2024-01-10 14:00',
        status: 'rejected',
        steps: [
          { nodeId: '301', nodeName: '发起申请', approverId: '', approverName: '王五', result: 'AUTO_APPROVED', comment: '申请归档', time: '2024-01-10 14:00', isCurrent: false, isCompleted: true, nodeOrder: 1, conditionExpression: '', isSkippable: false },
          { nodeId: '302', nodeName: '部门主管审批', approverId: '', approverName: '王经理', result: 'REJECTED', comment: '文档不完整，请补充', time: '2024-01-10 15:00', isCurrent: false, isCompleted: true, nodeOrder: 2, conditionExpression: '', isSkippable: false }
        ]
      }
    ];
    this.total = 15;
  }

  handlePageChange(page: number): void {
    this.pageNum = page;
    this.loadList();
  }

  viewDetail(item: ApprovalInstance): void {
    this.currentInstance = { ...item };
    this.loadApprovalPath(item.id);
  }

  loadApprovalPath(instanceId: string): void {
    this.httpService.get<any>(`/api/approvals/${instanceId}/path`)
      .subscribe({
        next: (res) => {
          if (res.code === 200 && res.data && this.currentInstance) {
            this.currentInstance.steps = res.data.map((d: ApprovalPathDTO) => ({
              nodeId: d.nodeId,
              nodeName: d.nodeName,
              approverId: d.approverId,
              approverName: d.approverName,
              result: d.result,
              comment: d.comment,
              time: d.time,
              isCurrent: d.isCurrent,
              isCompleted: d.isCompleted,
              nodeOrder: d.nodeOrder,
              conditionExpression: d.conditionExpression,
              isSkippable: d.isSkippable
            }));
          }
        },
        error: () => {
        }
      });
    this.detailModal = true;
  }

  quickApprove(item: ApprovalInstance): void {
    this.quickInstance = item;
    this.confirmAction = 'approve';
    this.confirmActionText = '同意';
    this.quickComment = '同意';
    this.confirmModal = true;
  }

  quickReject(item: ApprovalInstance): void {
    this.quickInstance = item;
    this.confirmAction = 'reject';
    this.confirmActionText = '驳回';
    this.quickComment = '';
    this.confirmModal = true;
  }

  executeQuickAction(): void {
    if (!this.quickInstance) return;

    const action = this.confirmAction === 'approve' ? 'APPROVE' : 'REJECT';
    const comment = this.confirmAction === 'approve' ? (this.quickComment || '同意') : this.quickComment;

    this.httpService.post<any>('/api/approvals/process', {
      instanceId: this.quickInstance.id,
      action: action,
      comment: comment
    }).subscribe({
      next: (res) => {
        if (res.code === 200) {
          this.confirmModal = false;
          this.loadList();
        }
      },
      error: () => {
        this.confirmModal = false;
        this.loadList();
      }
    });
  }

  handleApprove(): void {
    this.submitApproval('APPROVE');
  }

  handleReject(): void {
    this.submitApproval('REJECT');
  }

  handleTransfer(): void {
    this.submitApproval('TRANSFER');
  }

  submitApproval(action: string): void {
    if (!this.currentInstance) return;

    this.httpService.post<any>('/api/approvals/process', {
      instanceId: this.currentInstance.id,
      action: action,
      comment: this.comment
    }).subscribe({
      next: (res) => {
        if (res.code === 200) {
          this.detailModal = false;
          this.comment = '';
          this.loadList();
        }
      },
      error: () => {
        this.detailModal = false;
        this.comment = '';
        this.loadList();
      }
    });
  }

  handleDetailConfirm(): void {
    this.detailModal = false;
  }

  goToFlowDesign(): void {
    this.router.navigate(['/flow-design']);
  }

  getStatusClass(status: string): string {
    return 'status-' + status;
  }

  getStatusText(status: string): string {
    const map: Record<string, string> = {
      pending: '审批中',
      approved: '已通过',
      rejected: '已驳回',
      cancelled: '已取消'
    };
    return map[status] || status;
  }

  getStepClass(step: ApprovalStep): string {
    if (step.isCurrent) return 'current';
    if (!step.isCompleted) return 'pending';
    const result = step.result?.toLowerCase() || 'pending';
    if (result === 'auto_approved') return 'auto_approved';
    return result;
  }

  getStepStatusText(step: ApprovalStep): string {
    if (step.isCurrent) return '当前节点';
    if (!step.isCompleted) return '待处理';
    const map: Record<string, string> = {
      APPROVED: '已通过',
      REJECTED: '已驳回',
      TRANSFERRED: '已转审',
      SKIPPED: '已跳过',
      AUTO_APPROVED: '自动通过'
    };
    return map[step.result] || '待处理';
  }
}
