import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NotificationService } from '../../core/notification.service';
import { Notification } from '../../models/notification.model';
import { Subscription, interval } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="notification-bell-container">
      <button class="bell-btn" (click)="togglePanel()" [class.active]="isPanelOpen">
        <span class="bell-icon">🔔</span>
        <span *ngIf="unreadCount > 0" class="badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
      </button>

      <div *ngIf="isPanelOpen" class="notification-panel">
        <div class="panel-header">
          <h3>通知中心</h3>
          <button class="mark-all-btn" (click)="handleMarkAllAsRead()" *ngIf="unreadCount > 0">
            全部已读
          </button>
        </div>

        <div class="notification-list" *ngIf="recentNotifications.length > 0">
          <div
            *ngFor="let notification of recentNotifications"
            class="notification-item"
            [class.unread]="!notification.isRead"
            (click)="handleNotificationClick(notification)"
          >
            <div class="notification-icon" [class]="getTypeClass(notification.type)">
              {{ getTypeIcon(notification.type) }}
            </div>
            <div class="notification-content">
              <div class="notification-title">{{ notification.title }}</div>
              <div class="notification-text">{{ notification.content }}</div>
              <div class="notification-time">{{ formatTime(notification.createdAt) }}</div>
            </div>
            <div *ngIf="!notification.isRead" class="unread-dot"></div>
          </div>
        </div>

        <div *ngIf="recentNotifications.length === 0" class="empty-state">
          暂无通知
        </div>

        <div class="panel-footer">
          <button class="view-all-btn" (click)="emitViewAll()">
            查看全部通知
          </button>
        </div>
      </div>

      <div *ngIf="isPanelOpen" class="overlay" (click)="closePanel()"></div>
    </div>
  `,
  styles: [`
    .notification-bell-container {
      position: relative;
      display: inline-block;
    }

    .bell-btn {
      position: relative;
      width: 40px;
      height: 40px;
      border: none;
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .bell-btn:hover,
    .bell-btn.active {
      background: #f3f4f6;
    }

    .bell-icon {
      font-size: 20px;
    }

    .badge {
      position: absolute;
      top: 2px;
      right: 2px;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      background: #ef4444;
      color: white;
      font-size: 10px;
      font-weight: 600;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 999;
    }

    .notification-panel {
      position: absolute;
      top: 48px;
      right: 0;
      width: 360px;
      max-height: 480px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid #e5e7eb;
    }

    .panel-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }

    .mark-all-btn {
      padding: 4px 12px;
      font-size: 12px;
      color: #3b82f6;
      background: none;
      border: none;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.2s;
    }

    .mark-all-btn:hover {
      background: #eff6ff;
    }

    .notification-list {
      flex: 1;
      overflow-y: auto;
      max-height: 340px;
    }

    .notification-item {
      display: flex;
      padding: 12px 16px;
      gap: 12px;
      cursor: pointer;
      transition: background 0.2s;
      border-bottom: 1px solid #f3f4f6;
      position: relative;
    }

    .notification-item:hover {
      background: #f9fafb;
    }

    .notification-item.unread {
      background: #eff6ff;
    }

    .notification-item.unread:hover {
      background: #dbeafe;
    }

    .notification-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
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

    .notification-content {
      flex: 1;
      min-width: 0;
    }

    .notification-title {
      font-size: 14px;
      font-weight: 500;
      color: #111827;
      margin-bottom: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .notification-text {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .notification-time {
      font-size: 11px;
      color: #9ca3af;
    }

    .unread-dot {
      width: 8px;
      height: 8px;
      background: #3b82f6;
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 6px;
    }

    .empty-state {
      padding: 40px 16px;
      text-align: center;
      color: #9ca3af;
      font-size: 14px;
    }

    .panel-footer {
      padding: 12px 16px;
      border-top: 1px solid #e5e7eb;
    }

    .view-all-btn {
      width: 100%;
      padding: 8px;
      font-size: 14px;
      color: #3b82f6;
      background: #eff6ff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .view-all-btn:hover {
      background: #dbeafe;
    }
  `]
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  unreadCount = 0;
  recentNotifications: Notification[] = [];
  isPanelOpen = false;
  private refreshSubscription?: Subscription;

  constructor(
    private notificationService: NotificationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadData();
    this.refreshSubscription = interval(60000).pipe(
      switchMap(() => this.notificationService.getCount())
    ).subscribe(result => {
      if (result.code === 200) {
        this.unreadCount = result.data.unread;
      }
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  private loadData(): void {
    this.notificationService.getCount().subscribe(result => {
      if (result.code === 200) {
        this.unreadCount = result.data.unread;
      }
    });

    this.notificationService.getNotifications(undefined, 1, 5).subscribe(result => {
      if (result.code === 200) {
        this.recentNotifications = result.data.list;
      }
    });
  }

  togglePanel(): void {
    this.isPanelOpen = !this.isPanelOpen;
    if (this.isPanelOpen) {
      this.loadData();
    }
  }

  closePanel(): void {
    this.isPanelOpen = false;
  }

  handleNotificationClick(notification: Notification): void {
    if (!notification.isRead) {
      this.notificationService.markAsRead(notification.id).subscribe(result => {
        if (result.code === 200) {
          notification.isRead = true;
          this.unreadCount = Math.max(0, this.unreadCount - 1);
        }
      });
    }
  }

  handleMarkAllAsRead(): void {
    this.notificationService.markAllAsRead().subscribe(result => {
      if (result.code === 200) {
        this.recentNotifications.forEach(n => n.isRead = true);
        this.unreadCount = 0;
      }
    });
  }

  emitViewAll(): void {
    this.closePanel();
    this.router.navigate(['/notifications']);
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

  formatTime(date: Date): string {
    const now = new Date();
    const d = new Date(date);
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return d.toLocaleDateString();
  }
}
