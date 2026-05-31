import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { HttpService } from '../../core/http.service';
import { FileUploadComponent } from '../../shared/components/file-upload.component';
import { FilePreviewComponent } from '../../shared/components/file-preview.component';
import { ModalComponent } from '../../shared/components/modal.component';

interface AssetDetail {
  id: string;
  code: string;
  title: string;
  type: string;
  status: string;
  securityLevel: string;
  author: string;
  department: string;
  project: string;
  summary: string;
  keywords: string[];
  createdAt: string;
}

interface Attachment {
  id: string;
  name: string;
  size: number;
  fileType: string;
  downloadUrl: string;
  uploadedAt: string;
}

interface Version {
  id: string;
  version: string;
  description: string;
  createdAt: string;
  creator: string;
}

interface ApprovalRecord {
  id: string;
  node: string;
  approver: string;
  comment: string;
  status: string;
  time: string;
}

interface OperationLog {
  id: string;
  action: string;
  operator: string;
  time: string;
}

@Component({
  selector: 'app-archive-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, FileUploadComponent, FilePreviewComponent, ModalComponent],
  template: `
    <div class="detail-container">
      <div class="breadcrumb">
        <a [routerLink]="['/archive']" class="breadcrumb-link">档案管理</a>
        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-current">{{ asset?.title || '加载中...' }}</span>
      </div>

      <div class="detail-card">
        <div class="card-header">
          <h2 class="asset-title">{{ asset?.title }}</h2>
          <div class="asset-actions">
            <button class="btn btn-primary">编辑</button>
            <button class="btn btn-secondary">归档</button>
            <button class="btn btn-secondary">借阅</button>
            <button class="btn btn-success">提交审批</button>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">资产编号</span>
            <span class="info-value">{{ asset?.code }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">类型</span>
            <span class="info-value">{{ asset?.type }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">状态</span>
            <span class="status-badge" [ngClass]="getStatusClass(asset?.status)">{{ asset?.status }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">密级</span>
            <span class="info-value">{{ asset?.securityLevel }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">作者</span>
            <span class="info-value">{{ asset?.author }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">部门</span>
            <span class="info-value">{{ asset?.department }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">所属项目</span>
            <span class="info-value">{{ asset?.project }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">创建时间</span>
            <span class="info-value">{{ asset?.createdAt }}</span>
          </div>
        </div>

        <div class="info-section">
          <h3 class="section-title">摘要</h3>
          <p class="section-content">{{ asset?.summary }}</p>
        </div>

        <div class="info-section">
          <h3 class="section-title">关键词</h3>
          <div class="keywords">
            <span class="keyword-tag" *ngFor="let kw of asset?.keywords">{{ kw }}</span>
          </div>
        </div>
      </div>

      <div class="tabs-card">
        <div class="tabs-header">
          <button 
            *ngFor="let tab of tabs" 
            class="tab-item"
            [class.active]="activeTab === tab.key"
            (click)="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="tabs-content">
          <ng-container *ngIf="activeTab === 'attachments'">
            <div class="attachment-list">
              <div class="attachment-item" *ngFor="let item of attachments">
                <span class="attachment-icon">{{ getFileIcon(item.name) }}</span>
                <div class="attachment-info">
                  <span class="attachment-name">{{ item.name }}</span>
                  <span class="attachment-meta">{{ formatSize(item.size) }} · {{ item.uploadedAt }}</span>
                </div>
                <div class="attachment-actions">
                  <button class="btn btn-secondary btn-sm" (click)="previewFile(item)" title="预览">
                    👁️ 预览
                  </button>
                  <button class="btn btn-primary btn-sm" (click)="downloadFile(item)" title="下载">
                    ⬇ 下载
                  </button>
                </div>
              </div>
            </div>
          </ng-container>

          <ng-container *ngIf="activeTab === 'versions'">
            <div class="version-list">
              <div class="version-item" *ngFor="let v of versions">
                <div class="version-header">
                  <span class="version-tag">v{{ v.version }}</span>
                  <span class="version-desc">{{ v.description }}</span>
                </div>
                <div class="version-meta">
                  <span>{{ v.creator }}</span>
                  <span>{{ v.createdAt }}</span>
                </div>
              </div>
            </div>
          </ng-container>

          <ng-container *ngIf="activeTab === 'approvals'">
            <div class="approval-list">
              <div class="approval-item" *ngFor="let record of approvalRecords">
                <div class="approval-node">{{ record.node }}</div>
                <div class="approval-info">
                  <span class="approval-approver">{{ record.approver }}</span>
                  <span class="approval-comment">{{ record.comment }}</span>
                </div>
                <span class="approval-status">{{ record.status }}</span>
                <span class="approval-time">{{ record.time }}</span>
              </div>
            </div>
          </ng-container>

          <ng-container *ngIf="activeTab === 'logs'">
            <div class="log-list">
              <div class="log-item" *ngFor="let log of operationLogs">
                <span class="log-time">{{ log.time }}</span>
                <span class="log-operator">{{ log.operator }}</span>
                <span class="log-action">{{ log.action }}</span>
              </div>
            </div>
          </ng-container>
        </div>
      </div>

      <app-modal [(visible)]="previewModalVisible" title="文件预览" width="900px">
        <app-file-preview
          *ngIf="previewFile"
          [fileName]="previewFile.name"
          [fileUrl]="previewFile.downloadUrl"
          [mimeType]="previewFile.fileType"
          (close)="closePreview()"
          (download)="downloadFile(previewFile!)"
        ></app-file-preview>
      </app-modal>
    </div>
  `,
  styles: [`
    .detail-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }
    .breadcrumb-link {
      color: #3b82f6;
      text-decoration: none;
    }
    .breadcrumb-link:hover {
      text-decoration: underline;
    }
    .breadcrumb-separator {
      color: #9ca3af;
    }
    .breadcrumb-current {
      color: #374151;
    }
    .detail-card, .tabs-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    .card-header {
      padding: 20px 24px;
      border-bottom: 1px solid #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .asset-title {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #111827;
    }
    .asset-actions {
      display: flex;
      gap: 12px;
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
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }
    .btn-secondary:hover {
      background: #e5e7eb;
    }
    .btn-success {
      background: #10b981;
      color: white;
    }
    .btn-success:hover {
      background: #059669;
    }
    .btn-sm {
      padding: 4px 12px;
      font-size: 12px;
    }
    .info-grid {
      padding: 20px 24px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      border-bottom: 1px solid #f3f4f6;
    }
    .info-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .info-label {
      font-size: 12px;
      color: #6b7280;
    }
    .info-value {
      font-size: 14px;
      color: #111827;
      font-weight: 500;
    }
    .status-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      display: inline-block;
      align-self: flex-start;
    }
    .status-draft {
      background: #f3f4f6;
      color: #6b7280;
    }
    .status-pending {
      background: #fef3c7;
      color: #d97706;
    }
    .status-archived {
      background: #d1fae5;
      color: #059669;
    }
    .info-section {
      padding: 16px 24px;
      border-bottom: 1px solid #f3f4f6;
    }
    .info-section:last-child {
      border-bottom: none;
    }
    .section-title {
      margin: 0 0 8px 0;
      font-size: 14px;
      font-weight: 600;
      color: #374151;
    }
    .section-content {
      margin: 0;
      font-size: 14px;
      color: #6b7280;
      line-height: 1.6;
    }
    .keywords {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .keyword-tag {
      padding: 4px 12px;
      background: #eff6ff;
      color: #3b82f6;
      border-radius: 12px;
      font-size: 12px;
    }
    .tabs-header {
      display: flex;
      border-bottom: 1px solid #f3f4f6;
      padding: 0 24px;
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
    .tabs-content {
      padding: 24px;
    }
    .attachment-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .attachment-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: #f9fafb;
      border-radius: 6px;
    }
    .attachment-icon {
      font-size: 24px;
    }
    .attachment-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .attachment-name {
      font-size: 14px;
      color: #111827;
      font-weight: 500;
    }
    .attachment-meta {
      font-size: 12px;
      color: #6b7280;
    }
    .version-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .version-item {
      padding: 16px;
      background: #f9fafb;
      border-radius: 6px;
    }
    .version-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .version-tag {
      padding: 2px 8px;
      background: #3b82f6;
      color: white;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .version-desc {
      font-size: 14px;
      color: #111827;
      font-weight: 500;
    }
    .version-meta {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: #6b7280;
    }
    .approval-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .approval-item {
      display: grid;
      grid-template-columns: 120px 1fr 100px 160px;
      gap: 12px;
      align-items: center;
      padding: 12px 16px;
      background: #f9fafb;
      border-radius: 6px;
    }
    .approval-node {
      font-size: 14px;
      font-weight: 500;
      color: #111827;
    }
    .approval-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .approval-approver {
      font-size: 14px;
      color: #374151;
    }
    .approval-comment {
      font-size: 12px;
      color: #6b7280;
    }
    .approval-status {
      font-size: 14px;
      color: #059669;
    }
    .approval-time {
      font-size: 12px;
      color: #6b7280;
    }
    .log-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .log-item {
      display: flex;
      gap: 16px;
      padding: 12px 16px;
      background: #f9fafb;
      border-radius: 6px;
      font-size: 14px;
    }
    .log-time {
      color: #6b7280;
      width: 160px;
    }
    .log-operator {
      color: #374151;
      width: 100px;
    }
    .log-action {
      color: #111827;
      flex: 1;
    }
  `]
})
export class ArchiveDetailComponent implements OnInit {
  asset: AssetDetail | null = null;
  activeTab = 'attachments';

  tabs = [
    { key: 'attachments', label: '附件' },
    { key: 'versions', label: '版本历史' },
    { key: 'approvals', label: '审批记录' },
    { key: 'logs', label: '操作日志' }
  ];

  attachments: Attachment[] = [];
  versions: Version[] = [];
  approvalRecords: ApprovalRecord[] = [];
  operationLogs: OperationLog[] = [];

  previewModalVisible = false;
  previewFile: Attachment | null = null;

  constructor(
    private route: ActivatedRoute,
    private httpService: HttpService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.loadAssetDetail(id || '');
  }

  loadAssetDetail(id: string): void {
    this.asset = {
      id,
      code: 'AST-2024-001',
      title: '2024年度财务预算报告.pdf',
      type: '项目报告',
      status: '已归档',
      securityLevel: '内部',
      author: '张三',
      department: '财务部',
      project: '2024年度预算项目',
      summary: '本报告详细说明了2024年度公司财务预算情况，包括收入预算、支出预算、现金流预测等内容。',
      keywords: ['财务', '预算', '2024'],
      createdAt: '2024-01-15'
    };

    this.attachments = [
      { id: '1', name: '2024年度财务预算报告.pdf', size: 2048000, uploadedAt: '2024-01-15 10:30' }
    ];

    this.versions = [
      { id: '1', version: '1.0', description: '初始版本', createdAt: '2024-01-10 09:00', creator: '张三' },
      { id: '2', version: '1.1', description: '修改预算数据更新', createdAt: '2024-01-12 14:30', creator: '李四' }
    ];

    this.approvalRecords = [
      { id: '1', node: '部门主管审批', approver: '王经理', comment: '同意', status: '通过', time: '2024-01-13 09:15' },
      { id: '2', node: '财务总监审批', approver: '赵总监', comment: '数据合理，同意', status: '通过', time: '2024-01-14 15:20' }
    ];

    this.operationLogs = [
      { id: '1', action: '创建档案', operator: '张三', time: '2024-01-10 09:00' },
      { id: '2', action: '上传附件', operator: '张三', time: '2024-01-10 09:05' },
      { id: '3', action: '提交审批', operator: '张三', time: '2024-01-10 10:00' },
      { id: '4', action: '审批通过', operator: '系统', time: '2024-01-14 15:20' },
      { id: '5', action: '归档完成', operator: '系统', time: '2024-01-15 08:00' }
    ];
  }

  getStatusClass(status: string | undefined): string {
    const map: Record<string, string> = {
      '草稿': 'status-draft',
      '待审批': 'status-pending',
      '已归档': 'status-archived'
    };
    return map[status || ''] || '';
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  getFileIcon(filename: string): string {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    const iconMap: Record<string, string> = {
      '.pdf': '📄', '.doc': '📝', '.docx': '📝', '.xls': '📊', '.xlsx': '📊',
      '.ppt': '📽️', '.pptx': '📽️', '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️',
      '.gif': '🖼️', '.zip': '📦', '.rar': '📦', '.7z': '📦', '.mp4': '🎬',
      '.mp3': '🎵', '.txt': '📃', '.csv': '📋', '.json': '📋', '.xml': '📋'
    };
    return iconMap[ext] || '📁';
  }

  previewFile(item: Attachment): void {
    this.previewFile = item;
    this.previewModalVisible = true;
  }

  closePreview(): void {
    this.previewModalVisible = false;
    this.previewFile = null;
  }

  downloadFile(item: Attachment): void {
    const link = document.createElement('a');
    link.href = item.downloadUrl;
    link.download = item.name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
