import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { NotificationBellComponent } from '../shared/components/notification-bell.component';

interface MenuItem {
  label: string;
  icon: string;
  path: string;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationBellComponent],
  template: `
    <div class="layout-container">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h1 class="logo">📚 档案管理系统</h1>
        </div>
        <nav class="sidebar-nav">
          <a 
            *ngFor="let item of menuItems"
            [routerLink]="item.path"
            routerLinkActive="active"
            class="nav-item"
            [routerLinkActiveOptions]="{ exact: item.path === '/workspace' }"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span class="nav-label">{{ item.label }}</span>
          </a>
        </nav>
      </aside>

      <div class="main-wrapper">
        <header class="header">
          <div class="header-title">
            {{ currentPageTitle }}
          </div>
          <div class="header-right">
            <app-notification-bell></app-notification-bell>
            <div class="user-info">
              <span class="user-avatar">{{ userAvatar }}</span>
              <span class="user-name">{{ userName }}</span>
            </div>
            <button class="logout-btn" (click)="handleLogout()">
              退出登录
            </button>
          </div>
        </header>

        <main class="content">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [`
    .layout-container {
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    .sidebar {
      width: 240px;
      background: #1f2937;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    .sidebar-header {
      padding: 20px;
      border-bottom: 1px solid #374151;
    }
    .logo {
      margin: 0;
      font-size: 18px;
      color: white;
      font-weight: 600;
    }
    .sidebar-nav {
      padding: 16px 0;
      flex: 1;
      overflow-y: auto;
    }
    .nav-item {
      display: flex;
      align-items: center;
      padding: 12px 20px;
      color: #9ca3af;
      text-decoration: none;
      transition: all 0.2s;
      cursor: pointer;
    }
    .nav-item:hover {
      background: #374151;
      color: white;
    }
    .nav-item.active {
      background: #3b82f6;
      color: white;
    }
    .nav-icon {
      width: 24px;
      margin-right: 12px;
      font-size: 18px;
    }
    .nav-label {
      font-size: 14px;
    }
    .main-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #f3f4f6;
    }
    .header {
      height: 60px;
      background: white;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      flex-shrink: 0;
    }
    .header-title {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .user-info {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .user-avatar {
      width: 32px;
      height: 32px;
      background: #3b82f6;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 14px;
      font-weight: 600;
    }
    .user-name {
      font-size: 14px;
      color: #374151;
    }
    .logout-btn {
      padding: 6px 16px;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      color: #374151;
      cursor: pointer;
      transition: all 0.2s;
    }
    .logout-btn:hover {
      background: #e5e7eb;
    }
    .content {
      flex: 1;
      overflow: auto;
      padding: 24px;
    }
  `]
})
export class LayoutComponent {
  menuItems: MenuItem[] = [
    { label: '工作台', icon: '🏠', path: '/workspace' },
    { label: '档案管理', icon: '📁', path: '/archive' },
    { label: '借阅管理', icon: '🔄', path: '/circulation' },
    { label: '版本管理', icon: '📋', path: '/version' },
    { label: '审批管理', icon: '✅', path: '/approval' },
    { label: '通知中心', icon: '🔔', path: '/notifications' },
    { label: '权限管理', icon: '🔒', path: '/permission' }
  ];

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  get userName(): string {
    return this.authService.currentUser?.realName || '用户';
  }

  get userAvatar(): string {
    return this.userName.charAt(0);
  }

  get currentPageTitle(): string {
    const path = this.router.url;
    const item = this.menuItems.find(m => path.startsWith(m.path));
    return item?.label || '工作台';
  }

  handleLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
