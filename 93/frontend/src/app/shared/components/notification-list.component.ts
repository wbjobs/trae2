import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../core/notification.service';
import { Notification } from '../../models/notification.model';
import { PaginationComponent } from './pagination.component';
import { PageResult } from '../../models/common.model';

@Component({
  selector: 'app-notification-list',
  standalone: true,
  imports: [CommonModule, PaginationComponent],
  template: `
    <div class="notification-list-container">
      <div class="list-header">
        <h2>通知列表</h2>
        <div class="filter-tabs">
          <button
            *ngFor="let tab of tabs"
            class="tab-btn"
            [class.active]="currentTab === tab.value"
            (click)="switchTab(tab.value)"
          >
            {{ tab.label }}
            <span *ngIf="tab.value === 'unread' && unreadCount > 0" class="tab-badge">
              {{ unreadCount }}
            </span>
          </button>
        </div>
        <button
          class="mark-all-btn"
          *ngIf="unreadCount > 0"
          (click)="handleMarkAllAsRead()"
        >
          全部标记已读
        </button>
      </div>

      <div class="notifications-wrapper" *ngIf="notifications.length > 0">
        <div
          *ngFor="let notification of notifications"
          class="notification-card"
          [class.unread]="!notification.isRead"
        >
          <div class="card-header">
            <div class="notification-icon" [class]="getTypeClass(notification.type)">
              {{ getTypeIcon(notification.type) }}
            </div>
            <div class="notification-meta">
              <span class="notification-type">{{ getTypeLabel(notification.type) }}</span>
              <span class="notification-time">{{ formatDate(notification.createdAt) }}</span>
            </div>
            <div class="card-actions">
              <button
                *ngIf="!notification.isRead"
                class="action-btn read-btn"
                (click)="handleMarkAsRead(notification)"
                title="标记已读"
              >
                ✓
              </button>
              <button
                class="action-btn delete-btn"
                (click)="handleDelete(notification)"
                title="删除"
              >
                ✕
              </button>
            </div>
          </div>
          <div class="card-body">
            <h3 class="notification-title">{{ notification.title }}</h3>
            <p class="notification-content">{{ notification.content }}</p>
          </div>
          <div *ngIf="!notification.isRead" class="unread-indicator"></div>
        </div>
      </div>

      <div *ngIf="notifications.length === 0 && !loading" class="empty-state">
        <div class="empty-icon">📭</div>
        <p>{{ currentTab === 'unread' ? '暂无未读通知' : '暂无通知' }}</p>
      </div>

      <div *ngIf="loading" class="loading-state">
        加载中...
      </div>

      <app-pagination
        *ngIf="total > 0"
        [total]="total"
        [pageNum]="pageNum"
        [pageSize]="pageSize"
        (pageChange)="handlePageChange($event)"
      ></app-pagination>
    </div>
  `,
  styles: [`
    .notification-list-container {
      max-width: 800px;
      margin: 0 auto;
    }

    .list-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }

    .list-header h2 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
      color: #111827;
    }

    .filter-tabs {
      display: flex;
      gap: 8px;
      background: #f3f4f6;
      padding: 4px;
      border-radius: 8px;
    }

    .tab-btn {
      padding: 8px 16px;
      border: none;
      background: transparent;
      font-size: 14px;
      color: #6b7280;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .tab-btn:hover {
      color: #374151;
    }

    .tab-btn.active {
      background: white;
      color: #111827;
      font-weight: 500;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .tab-badge {
      background: #ef4444;
      color: white;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 10px;
      font-weight: 500;
    }

    .mark-all-btn {
      padding: 8px 16px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .mark-all-btn:hover {
      background: #2563eb;
    }

    .notifications-wrapper {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .notification-card {
      background: white;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      position: relative;
      border: 1px solid transparent;
      transition: all 0.2s;
    }

    .notification-card.unread {
      border-color: #3b82f6;
      background: #f8fafc;
    }

    .notification-card:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .notification-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }

    .notification-icon.due {
      background: #fef3c7;
    }

    .notification-icon.overdue {
      background: #fee2e2;
    }

    .notification-icon.approval {
      background: #dbeafe;
    }

    .notification-icon.approved {
      background: #d1fae5;
    }

    .notification-meta {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .notification-type {
      font-size: 12px;
      font-weight: 500;
      color: #6b7280;
    }

    .notification-time {
      font-size: 12px;
      color: #9ca3af;
    }

    .card-actions {
      display: flex;
      gap: 8px;
    }

    .action-btn {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: all 0.2s;
    }

    .read-btn {
      background: #ecfdf5;
      color: #059669;
    }

    .read-btn:hover {
      background: #d1fae5;
    }

    .delete-btn {
      background: #fef2f2;
      color: #dc2626;
    }

    .delete-btn:hover {
      background: #fee2e2;
    }

    .card-body {
      padding-left: 52px;
    }

    .notification-title {
      margin: 0 0 6px 0;
      font-size: 16px;
      font-weight: 500;
      color: #111827;
    }

    .notification-content {
      margin: 0;
      font-size: 14px;
      color: #6b7280;
      line-height: 1.5;
    }

    .unread-indicator {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 8px;
      height: 8px;
      background: #3b82f6;
      border-radius: 50%;
    }

    .empty-state,
    .loading-state {
      text-align: center;
      padding: 60px 20px;
      color: #9ca3af;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-state p {
      margin: 0;
      font-size: 16px;
    }
  `]
})
export class NotificationListComponent implements OnInit {
  notifications: Notification[] = [];
  total = 0;
  pageNum = 1;
  pageSize = 10;
  unreadCount = 0;
  loading = false;
  currentTab: 'all' | 'unread' | 'read' = 'all';

  tabs = [
    { label: '全部', value: 'all' as const },
    { label: '未读', value: 'unread' as const },
    { label: '已读', value: 'read' as const }
  ];

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    this.loadNotifications();
    this.loadUnreadCount();
  }

  switchTab(tab: 'all' | 'unread' | 'read'): void {
    this.currentTab = tab;
    this.pageNum = 1;
    this.loadNotifications();
  }

  private loadNotifications(): void {
    this.loading = true;
    let isRead: boolean | undefined;
    if (this.currentTab === 'unread') isRead = false;
    if (this.currentTab === 'read') isRead = true;

    this.notificationService.getNotifications(isRead, this.pageNum, this.pageSize)
      .subscribe(result => {
        if (result.code === 200) {
          const pageResult = result.data as PageResult<Notification>;
          this.notifications = pageResult.list;
          this.total = pageResult.total;
        }
        this.loading = false;
      });
  }

  private loadUnreadCount(): void {
    this.notificationService.getCount().subscribe(result => {
      if (result.code === 200) {
        this.unreadCount = result.data.unread;
      }
    });
  }

  handlePageChange(page: number): void {
    this.pageNum = page;
    this.loadNotifications();
  }

  handleMarkAsRead(notification: Notification): void {
    this.notificationService.markAsRead(notification.id).subscribe(result => {
      if (result.code === 200) {
        notification.isRead = true;
        this.unreadCount = Math.max(0, this.unreadCount - 1);
        if (this.currentTab === 'unread') {
          this.loadNotifications();
        }
      }
    });
  }

  handleMarkAllAsRead(): void {
    this.notificationService.markAllAsRead().subscribe(result => {
      if (result.code === 200) {
        this.notifications.forEach(n => n.isRead = true);
        this.unreadCount = 0;
        if (this.currentTab === 'unread') {
          this.loadNotifications();
        }
      }
    });
  }

  handleDelete(notification: Notification): void {
    if (confirm('确定要删除这条通知吗？')) {
      this.notificationService.delete(notification.id).subscribe(result => {
        if (result.code === 200) {
          if (!notification.isRead) {
            this.unreadCount = Math.max(0, this.unreadCount - 1);
          }
          this.loadNotifications();
        }
      });
    }
  }

  getTypeClass(type: string): string {
    switch (type) {
      case 'BORROW_DUE': return 'due';
      case 'BORROW_OVERDUE': return 'overdue';
      case 'APPROVAL': return 'approval';
      case 'APPROVED': return 'approved';
      default: return '';
    }
  }

  getTypeIcon(type: string): string {
    switch (type) {
      case 'BORROW_DUE': return '⏰';
      case 'BORROW_OVERDUE': return '⚠️';
      case 'APPROVAL': return '📝';
      case 'APPROVED': return '✅';
      default: return '📢';
    }
  }

  getTypeLabel(type: string): string {
    switch (type) {
      case 'BORROW_DUE': return '到期提醒';
      case 'BORROW_OVERDUE': return '逾期提醒';
      case 'APPROVAL': return '待审批';
      case 'APPROVED': return '已通过';
      default: return '系统通知';
    }
  }

  formatDate(date: Date): string {
    const d = new Date(date);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
