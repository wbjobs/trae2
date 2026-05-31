import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpService } from '../core/http.service';
import { ModalComponent } from '../shared/components/modal.component';
import { PaginationComponent } from '../shared/components/pagination.component';
import { FileUploadComponent } from '../shared/components/file-upload.component';

interface Asset {
  id: string;
  code: string;
  title: string;
  type: string;
  status: string;
  securityLevel: string;
  createdAt: string;
  selected?: boolean;
}

interface QueryParams {
  keyword: string;
  type: string;
  status: string;
}

interface AssetForm {
  title: string;
  type: string;
  summary: string;
  keywords: string;
  author: string;
  securityLevel: string;
}

@Component({
  selector: 'app-archive',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ModalComponent,
    PaginationComponent,
    FileUploadComponent
  ],
  template: `
    <div class="archive-container">
      <div class="search-bar">
        <div class="search-inputs">
          <input 
            type="text" 
            class="search-input" 
            placeholder="搜索关键词..."
            [(ngModel)]="query.keyword"
            (keyup.enter)="handleSearch()"
          />
          <select class="search-select" [(ngModel)]="query.type">
            <option value="">全部类型</option>
            <option value="文档资料">文档资料</option>
            <option value="合同协议">合同协议</option>
            <option value="项目报告">项目报告</option>
            <option value="其他">其他</option>
          </select>
          <select class="search-select" [(ngModel)]="query.status">
            <option value="">全部状态</option>
            <option value="草稿">草稿</option>
            <option value="待审批">待审批</option>
            <option value="已归档">已归档</option>
          </select>
          <button class="btn btn-primary" (click)="handleSearch()">搜索</button>
        </div>
        <button class="btn btn-success" (click)="openCreateModal()">新增资产</button>
      </div>

      <div class="table-card">
        <table class="asset-table">
          <thead>
            <tr>
              <th width="40">
                <input type="checkbox" [(ngModel)]="selectAll" (change)="toggleSelectAll()" />
              </th>
              <th>资产编号</th>
              <th>标题</th>
              <th>类型</th>
              <th>状态</th>
              <th>密级</th>
              <th>创建时间</th>
              <th width="150">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let asset of assets">
            <td>
              <input type="checkbox" [(ngModel)]="asset.selected" />
            </td>
            <td>{{ asset.code }}</td>
            <td class="title-cell">
              <a [routerLink]="['/archive', asset.id]" class="title-link">{{ asset.title }}</a>
            </td>
            <td>{{ asset.type }}</td>
            <td>
              <span class="status-badge" [ngClass]="getStatusClass(asset.status)">{{ asset.status }}</span>
            </td>
            <td>{{ asset.securityLevel }}</td>
            <td>{{ asset.createdAt }}</td>
            <td>
              <div class="action-buttons">
                <button class="btn-text" [routerLink]="['/archive', asset.id]">查看</button>
                <button class="btn-text" (click)="handleArchive(asset)">归档</button>
                <button class="btn-text danger" (click)="handleDelete(asset)">删除</button>
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
      title="新建资产" 
      [(visible)]="createModal"
      width="600px"
      (onConfirm)="handleCreateConfirm"
    >
      <div class="form-container">
        <div class="form-row">
          <label class="form-label">标题</label>
          <input type="text" class="form-input" [(ngModel)]="form.title" placeholder="请输入标题" />
        </div>
        <div class="form-row">
          <label class="form-label">类型</label>
          <select class="form-input" [(ngModel)]="form.type">
            <option value="">请选择类型</option>
            <option value="文档资料">文档资料</option>
            <option value="合同协议">合同协议</option>
            <option value="项目报告">项目报告</option>
            <option value="其他">其他</option>
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">摘要</label>
          <textarea class="form-input textarea" [(ngModel)]="form.summary" placeholder="请输入摘要"></textarea>
        </div>
        <div class="form-row">
          <label class="form-label">关键词</label>
          <input type="text" class="form-input" [(ngModel)]="form.keywords" placeholder="多个关键词用逗号分隔" />
        </div>
        <div class="form-row">
          <label class="form-label">作者</label>
          <input type="text" class="form-input" [(ngModel)]="form.author" placeholder="请输入作者" />
        </div>
        <div class="form-row">
          <label class="form-label">密级</label>
          <select class="form-input" [(ngModel)]="form.securityLevel">
            <option value="">请选择密级</option>
            <option value="公开">公开</option>
            <option value="内部">内部</option>
            <option value="秘密">秘密</option>
            <option value="机密">机密</option>
            <option value="绝密">绝密</option>
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">附件上传</label>
          <app-file-upload 
            [multiple]="true" 
            accept=".pdf,.doc,.docx,.xls,.xlsx"
            [maxSize]="50"
          ></app-file-upload>
        </div>
      </div>
    </app-modal>
  `,
  styles: [`
    .archive-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .search-bar {
      background: white;
      padding: 16px 20px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    .search-inputs {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
    }
    .search-input {
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      width: 200px;
    }
    .search-select {
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      min-width: 120px;
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
    .table-card {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    .asset-table {
      width: 100%;
      border-collapse: collapse;
    }
    .asset-table th,
    .asset-table td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #f3f4f6;
      font-size: 14px;
    }
    .asset-table th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
    }
    .asset-table tbody tr:hover {
      background: #f9fafb;
    }
    .title-cell {
      max-width: 300px;
    }
    .title-link {
      color: #3b82f6;
      text-decoration: none;
    }
    .title-link:hover {
      text-decoration: underline;
    }
    .status-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
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
    .form-input:focus {
      outline: none;
      border-color: #3b82f6;
    }
  `]
})
export class ArchiveComponent implements OnInit {
  assets: Asset[] = [];
  query: QueryParams = {
    keyword: '',
    type: '',
    status: ''
  };
  total = 0;
  pageNum = 1;
  pageSize = 10;
  createModal = false;
  selectAll = false;
  uploading = false;

  form: AssetForm = {
    title: '',
    type: '',
    summary: '',
    keywords: '',
    author: '',
    securityLevel: ''
  };

  constructor(private httpService: HttpService) {}

  ngOnInit(): void {
    this.loadAssets();
  }

  loadAssets(): void {
    this.assets = [
      { id: '1', code: 'AST-2024-001', title: '2024年度财务预算报告.pdf', type: '项目报告', status: '已归档', securityLevel: '内部', createdAt: '2024-01-15' },
      { id: '2', code: 'AST-2024-002', title: '设备采购合同.docx', type: '合同协议', status: '待审批', securityLevel: '秘密', createdAt: '2024-01-12' },
      { id: '3', code: 'AST-2024-003', title: '客户需求分析报告.pdf', type: '文档资料', status: '已归档', securityLevel: '公开', createdAt: '2024-01-10' },
      { id: '4', code: 'AST-2024-004', title: '技术方案设计文档.docx', type: '文档资料', status: '草稿', securityLevel: '机密', createdAt: '2024-01-08' },
      { id: '5', code: 'AST-2024-005', title: '项目验收报告v1.0.pdf', type: '项目报告', status: '已归档', securityLevel: '内部', createdAt: '2024-01-05' }
    ];
    this.total = 56;
  }

  handleSearch(): void {
    this.pageNum = 1;
    this.loadAssets();
  }

  handlePageChange(page: number): void {
    this.pageNum = page;
    this.loadAssets();
  }

  openCreateModal(): void {
    this.createModal = true;
    this.form = {
      title: '',
      type: '',
      summary: '',
      keywords: '',
      author: '',
      securityLevel: ''
    };
  }

  handleCreateConfirm(): void {
    this.createModal = false;
    this.loadAssets();
  }

  handleArchive(asset: Asset): void {
    console.log('归档:', asset.title);
  }

  handleDelete(asset: Asset): void {
    if (confirm(`确定要删除 ${asset.title} 吗？`)) {
      this.assets = this.assets.filter(a => a.id !== asset.id);
    }
  }

  toggleSelectAll(): void {
    this.assets.forEach(asset => asset.selected = this.selectAll);
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      '草稿': 'status-draft',
      '待审批': 'status-pending',
      '已归档': 'status-archived'
    };
    return map[status] || '';
  }
}
