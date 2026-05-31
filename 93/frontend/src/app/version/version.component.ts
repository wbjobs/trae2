import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpService } from '../core/http.service';
import { ModalComponent } from '../shared/components/modal.component';

interface Asset {
  id: string;
  code: string;
  title: string;
}

interface Version {
  id: string;
  version: string;
  tag: string;
  description: string;
  creator: string;
  createdAt: string;
  selected?: boolean;
}

interface NewVersionForm {
  version: string;
  tag: string;
  description: string;
}

@Component({
  selector: 'app-version',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  template: `
    <div class="version-container">
      <div class="two-column-layout">
        <div class="left-panel">
          <div class="panel-header">
            <h3 class="panel-title">资产列表</h3>
          </div>
          <div class="panel-content">
            <div 
              class="asset-item" 
              *ngFor="let asset of assets"
              [class.selected]="selectedAsset?.id === asset.id"
              (click)="selectAsset(asset)"
            >
              <div class="asset-code">{{ asset.code }}</div>
              <div class="asset-title">{{ asset.title }}</div>
            </div>
          </div>
        </div>

        <div class="right-panel">
          <div class="panel-header">
            <h3 class="panel-title">
              版本历史
              <span *ngIf="selectedAsset" class="asset-name">- {{ selectedAsset.title }}</span>
            </h3>
            <div class="panel-actions">
              <button class="btn btn-primary" (click)="openCreateModal()" [disabled]="!selectedAsset">新建版本</button>
              <button 
                class="btn btn-secondary" 
                (click)="toggleCompareMode()"
                [class.active]="compareMode"
                [disabled]="!selectedAsset || versions.length < 2"
              >
                {{ compareMode ? '取消对比' : '版本对比' }}
              </button>
            </div>
          </div>

          <div class="panel-content">
            <ng-container *ngIf="compareMode">
              <div class="compare-selector">
                <div class="compare-item">
                  <label>版本 1</label>
                  <select [(ngModel)]="version1">
                    <option *ngFor="let v of versions" [value]="v.id">{{ v.version }} - {{ v.tag }}</option>
                  </select>
                </div>
                <span class="compare-arrow">→</span>
                <div class="compare-item">
                  <label>版本 2</label>
                  <select [(ngModel)]="version2">
                    <option *ngFor="let v of versions" [value]="v.id">{{ v.version }} - {{ v.tag }}</option>
                  </select>
                </div>
                <button class="btn btn-primary" (click)="doCompare()">对比</button>
              </div>

              <div class="compare-result" *ngIf="compareResult">
                <div class="compare-section">
                  <h4>变更内容对比</h4>
                  <div class="diff-content">
                    <div class="diff-line added">+ 新增了章节：技术架构说明</div>
                    <div class="diff-line modified">~ 修改了预算金额：从 100万 改为 120万</div>
                    <div class="diff-line removed">- 删除了过时的参考资料</div>
                  </div>
                </div>
              </div>
            </ng-container>

            <ng-container *ngIf="!compareMode">
              <div class="version-list" *ngIf="versions.length > 0">
                <div 
                  class="version-item" 
                  *ngFor="let version of versions"
                  [class.selected]="version.selected"
                  (click)="selectVersion(version)"
                >
                  <div class="version-header">
                    <div class="version-tag">{{ version.version }}</div>
                    <div class="version-label" *ngIf="version.tag">{{ version.tag }}</div>
                  </div>
                  <div class="version-desc">{{ version.description }}</div>
                  <div class="version-meta">
                    <span class="creator">{{ version.creator }}</span>
                    <span class="time">{{ version.createdAt }}</span>
                  </div>
                </div>
              </div>
              <div class="empty-state" *ngIf="!selectedAsset">
                <span class="empty-icon">📋</span>
                <p>请从左侧选择一个资产查看版本历史</p>
              </div>
              <div class="empty-state" *ngIf="selectedAsset && versions.length === 0">
                <span class="empty-icon">📋</span>
                <p>该资产暂无版本记录</p>
              </div>
            </ng-container>
          </div>
        </div>
      </div>
    </div>

    <app-modal 
      title="新建版本" 
      [(visible)]="createModal"
      width="500px"
      (onConfirm)="handleCreateConfirm"
    >
      <div class="form-container">
        <div class="form-row">
          <label class="form-label">版本号</label>
          <input type="text" class="form-input" [(ngModel)]="newVersionForm.version" placeholder="例如：1.2.0" />
        </div>
        <div class="form-row">
          <label class="form-label">版本标签</label>
          <select class="form-input" [(ngModel)]="newVersionForm.tag">
            <option value="">无标签</option>
            <option value="major">重大更新</option>
            <option value="minor">次要更新</option>
            <option value="patch">补丁修复</option>
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">变更说明</label>
          <textarea class="form-input textarea" [(ngModel)]="newVersionForm.description" placeholder="请描述本次版本的变更内容"></textarea>
        </div>
      </div>
    </app-modal>
  `,
  styles: [`
    .version-container {
      height: 100%;
    }
    .two-column-layout {
      display: flex;
      gap: 16px;
      height: calc(100vh - 160px);
    }
    .left-panel {
      width: 280px;
      background: white;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      flex-shrink: 0;
    }
    .right-panel {
      flex: 1;
      background: white;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    .panel-header {
      padding: 16px 20px;
      border-bottom: 1px solid #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .panel-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }
    .asset-name {
      font-size: 14px;
      font-weight: normal;
      color: #6b7280;
    }
    .panel-actions {
      display: flex;
      gap: 8px;
    }
    .btn {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
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
    .btn-secondary.active {
      background: #3b82f6;
      color: white;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .asset-item {
      padding: 12px 16px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 4px;
    }
    .asset-item:hover {
      background: #f9fafb;
    }
    .asset-item.selected {
      background: #eff6ff;
    }
    .asset-code {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .asset-title {
      font-size: 14px;
      color: #111827;
      font-weight: 500;
    }
    .compare-selector {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: #f9fafb;
      border-radius: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .compare-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .compare-item label {
      font-size: 12px;
      color: #6b7280;
    }
    .compare-item select {
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      min-width: 200px;
    }
    .compare-arrow {
      font-size: 24px;
      color: #6b7280;
      margin-top: 18px;
    }
    .compare-result {
      margin-top: 16px;
    }
    .compare-section h4 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
      color: #374151;
    }
    .diff-content {
      background: #f9fafb;
      border-radius: 6px;
      padding: 12px;
      font-family: monospace;
      font-size: 13px;
    }
    .diff-line {
      padding: 4px 8px;
      margin-bottom: 4px;
      border-radius: 4px;
    }
    .diff-line.added {
      background: #d1fae5;
      color: #065f46;
    }
    .diff-line.modified {
      background: #fef3c7;
      color: #92400e;
    }
    .diff-line.removed {
      background: #fee2e2;
      color: #991b1b;
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
      cursor: pointer;
      transition: all 0.2s;
      border: 2px solid transparent;
    }
    .version-item:hover {
      background: #f3f4f6;
    }
    .version-item.selected {
      border-color: #3b82f6;
      background: #eff6ff;
    }
    .version-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .version-tag {
      padding: 2px 10px;
      background: #3b82f6;
      color: white;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 600;
    }
    .version-label {
      padding: 2px 8px;
      background: #e5e7eb;
      color: #374151;
      border-radius: 4px;
      font-size: 12px;
    }
    .version-desc {
      font-size: 14px;
      color: #374151;
      margin-bottom: 8px;
    }
    .version-meta {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: #6b7280;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #6b7280;
    }
    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
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
      min-height: 100px;
      resize: vertical;
    }
  `]
})
export class VersionComponent implements OnInit {
  assets: Asset[] = [];
  selectedAsset: Asset | null = null;
  versions: Version[] = [];

  compareMode = false;
  version1 = '';
  version2 = '';
  compareResult = false;

  createModal = false;
  newVersionForm: NewVersionForm = {
    version: '',
    tag: '',
    description: ''
  };

  constructor(private httpService: HttpService) {}

  ngOnInit(): void {
    this.loadAssets();
  }

  loadAssets(): void {
    this.assets = [
      { id: '1', code: 'AST-2024-001', title: '2024年度财务预算报告.pdf' },
      { id: '2', code: 'AST-2024-002', title: '设备采购合同.docx' },
      { id: '3', code: 'AST-2024-003', title: '客户需求分析报告.pdf' },
      { id: '4', code: 'AST-2024-004', title: '技术方案设计文档.docx' }
    ];
  }

  selectAsset(asset: Asset): void {
    this.selectedAsset = asset;
    this.compareMode = false;
    this.compareResult = false;
    this.loadVersions(asset.id);
  }

  loadVersions(assetId: string): void {
    this.versions = [
      { id: '1', version: '1.2.0', tag: 'major', description: '重大更新：新增预算分析模块，优化了数据展示方式', creator: '张三', createdAt: '2024-01-15 10:30' },
      { id: '2', version: '1.1.5', tag: 'patch', description: '修复了第3章数据计算错误', creator: '李四', createdAt: '2024-01-12 14:20' },
      { id: '3', version: '1.1.0', tag: 'minor', description: '新增附录内容，更新了参考资料', creator: '张三', createdAt: '2024-01-10 09:15' },
      { id: '4', version: '1.0.0', tag: '', description: '初始版本发布', creator: '张三', createdAt: '2024-01-05 16:00' }
    ];
    if (this.versions.length >= 2) {
      this.version1 = this.versions[0].id;
      this.version2 = this.versions[1].id;
    }
  }

  selectVersion(version: Version): void {
    version.selected = !version.selected;
  }

  toggleCompareMode(): void {
    this.compareMode = !this.compareMode;
    this.compareResult = false;
  }

  doCompare(): void {
    if (this.version1 && this.version2 && this.version1 !== this.version2) {
      this.compareResult = true;
    }
  }

  openCreateModal(): void {
    this.createModal = true;
    const lastVersion = this.versions[0]?.version || '1.0.0';
    const parts = lastVersion.split('.').map(Number);
    parts[2]++;
    this.newVersionForm = {
      version: parts.join('.'),
      tag: '',
      description: ''
    };
  }

  handleCreateConfirm(): void {
    const newVersion: Version = {
      id: String(Date.now()),
      version: this.newVersionForm.version,
      tag: this.newVersionForm.tag,
      description: this.newVersionForm.description,
      creator: '当前用户',
      createdAt: new Date().toLocaleString()
    };
    this.versions.unshift(newVersion);
    this.createModal = false;
  }
}
