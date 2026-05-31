import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpService } from '../core/http.service';
import { ModalComponent } from '../shared/components/modal.component';
import { PaginationComponent } from '../shared/components/pagination.component';

interface CirculationRecord {
  id: string;
  borrower: string;
  assetTitle: string;
  assetCode: string;
  borrowDate: string;
  expectedReturn: string;
  actualReturn: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'borrowed' | 'returned' | 'overdue';
  purpose: string;
}

interface ApplyForm {
  assetId: string;
  purpose: string;
  borrowDate: string;
  expectedReturn: string;
}

interface AssetOption {
  id: string;
  title: string;
  code: string;
}

@Component({
  selector: 'app-circulation',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, PaginationComponent],
  template: `
    <div class="circulation-container">
      <div class="tabs-header">
        <button 
          *ngFor="let tab of tabs" 
          class="tab-item"
          [class.active]="activeTab === tab.key"
          (click)="activeTab = tab.key; loadRecords()"
        >
          {{ tab.label }}
        </button>
        <button class="btn btn-primary apply-btn" (click)="openApplyModal()">申请借阅</button>
      </div>

      <div class="table-card">
        <table class="record-table">
          <thead>
            <tr>
              <th>借阅人</th>
              <th>资产</th>
              <th>借阅日期</th>
              <th>预计归还</th>
              <th>实际归还</th>
              <th>状态</th>
              <th width="150">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let record of records">
              <td>{{ record.borrower }}</td>
              <td>
                <div class="asset-info">
                  <span class="asset-code">{{ record.assetCode }}</span>
                  <span class="asset-title">{{ record.assetTitle }}</span>
                </div>
              </td>
              <td>{{ record.borrowDate }}</td>
              <td>{{ record.expectedReturn }}</td>
              <td>{{ record.actualReturn || '-' }}</td>
              <td>
                <span class="status-badge" [ngClass]="getStatusClass(record.status)">{{ getStatusText(record.status) }}</span>
              </td>
              <td>
                <div class="action-buttons">
                  <ng-container *ngIf="record.status === 'pending'">
                    <button class="btn-text success" (click)="handleApprove(record)">通过</button>
                    <button class="btn-text danger" (click)="handleReject(record)">驳回</button>
                  </ng-container>
                  <ng-container *ngIf="record.status === 'borrowed' || record.status === 'overdue'">
                    <button class="btn-text" (click)="handleReturn(record)">归还</button>
                  </ng-container>
                  <button class="btn-text" (click)="viewDetail(record)">详情</button>
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
      title="申请借阅" 
      [(visible)]="applyModal"
      width="500px"
      (onConfirm)="handleApplyConfirm"
    >
      <div class="form-container">
        <div class="form-row">
          <label class="form-label">选择资产</label>
          <select class="form-input" [(ngModel)]="form.assetId">
            <option value="">请选择资产</option>
            <option *ngFor="let asset of assetOptions" [value]="asset.id">{{ asset.title }} ({{ asset.code }})</option>
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">借阅用途</label>
          <textarea class="form-input textarea" [(ngModel)]="form.purpose" placeholder="请输入借阅用途"></textarea>
        </div>
        <div class="form-row">
          <label class="form-label">借阅日期</label>
          <input type="date" class="form-input" [(ngModel)]="form.borrowDate" />
        </div>
        <div class="form-row">
          <label class="form-label">预计归还日期</label>
          <input type="date" class="form-input" [(ngModel)]="form.expectedReturn" />
        </div>
      </div>
    </app-modal>
  `,
  styles: [`
    .circulation-container {
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
    .apply-btn {
      margin: 8px 0;
    }
    .table-card {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    .record-table {
      width: 100%;
      border-collapse: collapse;
    }
    .record-table th,
    .record-table td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #f3f4f6;
      font-size: 14px;
    }
    .record-table th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
    }
    .record-table tbody tr:hover {
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
      background: #dbeafe;
      color: #2563eb;
    }
    .status-rejected {
      background: #fee2e2;
      color: #dc2626;
    }
    .status-borrowed {
      background: #d1fae5;
      color: #059669;
    }
    .status-returned {
      background: #f3f4f6;
      color: #6b7280;
    }
    .status-overdue {
      background: #fee2e2;
      color: #dc2626;
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
    .btn-text.success {
      color: #10b981;
    }
    .btn-text.success:hover {
      background: #d1fae5;
    }
    .btn-text.danger {
      color: #ef4444;
    }
    .btn-text.danger:hover {
      background: #fef2f2;
    }
    .form-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .form-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
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
  `]
})
export class CirculationComponent implements OnInit {
  activeTab = 'mine';
  tabs = [
    { key: 'mine', label: '我的借阅' },
    { key: 'pending', label: '待我审批' },
    { key: 'all', label: '全部记录' }
  ];

  records: CirculationRecord[] = [];
  total = 0;
  pageNum = 1;
  pageSize = 10;

  applyModal = false;
  form: ApplyForm = {
    assetId: '',
    purpose: '',
    borrowDate: '',
    expectedReturn: ''
  };

  assetOptions: AssetOption[] = [];

  constructor(private httpService: HttpService) {}

  ngOnInit(): void {
    this.loadRecords();
    this.loadAssetOptions();
  }

  loadRecords(): void {
    this.records = [
      { id: '1', borrower: '张三', assetTitle: '2024年度财务预算报告.pdf', assetCode: 'AST-2024-001', borrowDate: '2024-01-15', expectedReturn: '2024-01-20', actualReturn: null, status: 'borrowed', purpose: '编制报表需要' },
      { id: '2', borrower: '李四', assetTitle: '设备采购合同.docx', assetCode: 'AST-2024-002', borrowDate: '2024-01-10', expectedReturn: '2024-01-15', actualReturn: '2024-01-14', status: 'returned', purpose: '合同审核' },
      { id: '3', borrower: '王五', assetTitle: '客户需求分析报告.pdf', assetCode: 'AST-2024-003', borrowDate: '2024-01-18', expectedReturn: '2024-01-25', actualReturn: null, status: 'pending', purpose: '项目参考' },
      { id: '4', borrower: '赵六', assetTitle: '技术方案设计文档.docx', assetCode: 'AST-2024-004', borrowDate: '2024-01-05', expectedReturn: '2024-01-10', actualReturn: null, status: 'overdue', purpose: '技术方案评审' }
    ];
    this.total = 28;
  }

  loadAssetOptions(): void {
    this.assetOptions = [
      { id: '1', title: '2024年度财务预算报告.pdf', code: 'AST-2024-001' },
      { id: '2', title: '设备采购合同.docx', code: 'AST-2024-002' },
      { id: '3', title: '客户需求分析报告.pdf', code: 'AST-2024-003' }
    ];
  }

  handlePageChange(page: number): void {
    this.pageNum = page;
    this.loadRecords();
  }

  openApplyModal(): void {
    this.applyModal = true;
    this.form = {
      assetId: '',
      purpose: '',
      borrowDate: '',
      expectedReturn: ''
    };
  }

  handleApplyConfirm(): void {
    this.applyModal = false;
    this.loadRecords();
  }

  handleApprove(record: CirculationRecord): void {
    record.status = 'approved';
  }

  handleReject(record: CirculationRecord): void {
    record.status = 'rejected';
  }

  handleReturn(record: CirculationRecord): void {
    record.status = 'returned';
    record.actualReturn = new Date().toISOString().split('T')[0];
  }

  viewDetail(record: CirculationRecord): void {
    console.log('查看详情:', record.id);
  }

  getStatusClass(status: string): string {
    return 'status-' + status;
  }

  getStatusText(status: string): string {
    const map: Record<string, string> = {
      pending: '待审批',
      approved: '已批准',
      rejected: '已驳回',
      borrowed: '借阅中',
      returned: '已归还',
      overdue: '已逾期'
    };
    return map[status] || status;
  }
}
