import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpService } from '../core/http.service';

interface StatCard {
  label: string;
  value: number;
  icon: string;
  color: string;
}

interface AssetTypeData {
  name: string;
  value: number;
  color: string;
}

interface OperationRecord {
  id: string;
  time: string;
  user: string;
  action: string;
  asset: string;
}

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="workspace-container">
      <div class="stats-grid">
        <div class="stat-card" *ngFor="let stat of statCards">
          <div class="stat-icon" [style.background]="stat.color">
            {{ stat.icon }}
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stat.value }}</div>
            <div class="stat-label">{{ stat.label }}</div>
          </div>
        </div>
      </div>

      <div class="content-grid">
        <div class="chart-card">
          <div class="card-header">
            <h3 class="card-title">资产类型分布</h3>
          </div>
          <div class="chart-content">
            <div class="pie-chart">
              <div class="pie-center">
                <div class="pie-total">{{ totalAssets }}</div>
                <div class="pie-label">总计</div>
              </div>
            </div>
            <div class="chart-legend">
              <div class="legend-item" *ngFor="let item of assetTypeData">
                <span class="legend-dot" [style.background]="item.color"></span>
                <span class="legend-name">{{ item.name }}</span>
                <span class="legend-value">{{ item.value }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="records-card">
          <div class="card-header">
            <h3 class="card-title">最近操作记录</h3>
          </div>
          <div class="records-list">
            <div class="record-item" *ngFor="let record of operationRecords">
              <div class="record-time">{{ record.time }}</div>
              <div class="record-info">
                <span class="record-user">{{ record.user }}</span>
                <span class="record-action">{{ record.action }}</span>
              </div>
              <div class="record-asset">{{ record.asset }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="quick-actions">
        <div class="card-header">
          <h3 class="card-title">快捷操作</h3>
        </div>
        <div class="actions-grid">
          <button class="action-btn" [routerLink]="['/archive']" [queryParams]="{ action: 'create' }">
            <span class="action-icon">➕</span>
            <span class="action-label">新增资产</span>
          </button>
          <button class="action-btn" [routerLink]="['/archive']">
            <span class="action-icon">📦</span>
            <span class="action-label">查看归档</span>
          </button>
          <button class="action-btn" [routerLink]="['/circulation']">
            <span class="action-icon">📤</span>
            <span class="action-label">借阅申请</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .workspace-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
    }
    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    .stat-icon {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      flex-shrink: 0;
    }
    .stat-content {
      flex: 1;
    }
    .stat-value {
      font-size: 32px;
      font-weight: 700;
      color: #111827;
      line-height: 1.2;
    }
    .stat-label {
      font-size: 14px;
      color: #6b7280;
      margin-top: 4px;
    }
    .content-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .chart-card, .records-card, .quick-actions {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    .card-header {
      padding: 20px 24px;
      border-bottom: 1px solid #f3f4f6;
    }
    .card-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }
    .chart-content {
      padding: 24px;
      display: flex;
      align-items: center;
      gap: 32px;
    }
    .pie-chart {
      width: 180px;
      height: 180px;
      border-radius: 50%;
      background: conic-gradient(
        #3b82f6 0deg 120deg,
        #10b981 120deg 210deg,
        #f59e0b 210deg 280deg,
        #ef4444 280deg 360deg
      );
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      flex-shrink: 0;
    }
    .pie-center {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .pie-total {
      font-size: 28px;
      font-weight: 700;
      color: #111827;
    }
    .pie-label {
      font-size: 12px;
      color: #6b7280;
    }
    .chart-legend {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    .legend-name {
      flex: 1;
      font-size: 14px;
      color: #374151;
    }
    .legend-value {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
    }
    .records-list {
      padding: 16px 24px;
    }
    .record-item {
      padding: 12px 0;
      border-bottom: 1px solid #f3f4f6;
      display: grid;
      grid-template-columns: 80px 1fr 1fr;
      gap: 16px;
      align-items: center;
    }
    .record-item:last-child {
      border-bottom: none;
    }
    .record-time {
      font-size: 12px;
      color: #6b7280;
    }
    .record-info {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .record-user {
      font-size: 14px;
      color: #374151;
      font-weight: 500;
    }
    .record-action {
      font-size: 14px;
      color: #3b82f6;
    }
    .record-asset {
      font-size: 14px;
      color: #6b7280;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .actions-grid {
      padding: 24px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .action-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 24px;
      background: #f9fafb;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .action-btn:hover {
      background: #eff6ff;
      border-color: #3b82f6;
    }
    .action-icon {
      font-size: 32px;
    }
    .action-label {
      font-size: 14px;
      color: #374151;
      font-weight: 500;
    }
  `]
})
export class WorkspaceComponent implements OnInit {
  statCards: StatCard[] = [
    { label: '资产总数', value: 0, icon: '📚', color: '#dbeafe' },
    { label: '本月新增', value: 0, icon: '📈', color: '#d1fae5' },
    { label: '待审批', value: 0, icon: '⏳', color: '#fef3c7' },
    { label: '借阅中', value: 0, icon: '📤', color: '#fee2e2' }
  ];

  assetTypeData: AssetTypeData[] = [
    { name: '文档资料', value: 0, color: '#3b82f6' },
    { name: '合同协议', value: 0, color: '#10b981' },
    { name: '项目报告', value: 0, color: '#f59e0b' },
    { name: '其他', value: 0, color: '#ef4444' }
  ];

  operationRecords: OperationRecord[] = [];

  constructor(private httpService: HttpService) {}

  ngOnInit(): void {
    this.loadStatistics();
    this.loadOperationRecords();
  }

  get totalAssets(): number {
    return this.assetTypeData.reduce((sum, item) => sum + item.value, 0);
  }

  loadStatistics(): void {
    this.statCards[0].value = 1256;
    this.statCards[1].value = 89;
    this.statCards[2].value = 12;
    this.statCards[3].value = 45;

    this.assetTypeData[0].value = 456;
    this.assetTypeData[1].value = 328;
    this.assetTypeData[2].value = 285;
    this.assetTypeData[3].value = 187;
  }

  loadOperationRecords(): void {
    this.operationRecords = [
      { id: '1', time: '10:30', user: '张三', action: '上传了', asset: '项目验收报告v2.0.pdf' },
      { id: '2', time: '09:45', user: '李四', action: '借阅了', asset: '2024年度财务报表.xlsx' },
      { id: '3', time: '09:20', user: '王五', action: '审批通过', asset: '设备采购合同.docx' },
      { id: '4', time: '昨天', user: '赵六', action: '归档了', asset: '客户需求文档.pdf' },
      { id: '5', time: '昨天', user: '孙七', action: '编辑了', asset: '技术规范手册.docx' }
    ];
  }
}
