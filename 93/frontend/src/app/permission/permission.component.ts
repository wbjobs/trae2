import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpService } from '../core/http.service';

interface User {
  id: string;
  username: string;
  realName: string;
  department: string;
}

interface Role {
  id: string;
  roleCode: string;
  roleName: string;
  description: string;
}

interface Permission {
  id: string;
  permissionCode: string;
  permissionName: string;
  resourceType: string;
  action: string;
}

@Component({
  selector: 'app-permission',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="permission-container">
      <div class="three-column-layout">
        <div class="column">
          <div class="column-header">
            <h3 class="column-title">用户列表</h3>
          </div>
          <div class="column-content">
            <div 
              class="list-item" 
              *ngFor="let user of users"
              [class.selected]="selectedUser?.id === user.id"
              (click)="selectUser(user)"
            >
              <div class="item-info">
                <span class="item-avatar">{{ user.realName.charAt(0) }}</span>
                <div class="item-details">
                  <span class="item-name">{{ user.realName }}</span>
                  <span class="item-desc">{{ user.department }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="column">
          <div class="column-header">
            <h3 class="column-title">角色列表</h3>
            <div class="column-actions">
              <button class="btn btn-sm btn-primary" (click)="openRoleModal('add')">新增</button>
              <button class="btn btn-sm btn-secondary" (click)="openRoleModal('edit')" [disabled]="!selectedRole">编辑</button>
              <button class="btn btn-sm btn-danger" (click)="deleteRole()" [disabled]="!selectedRole">删除</button>
            </div>
          </div>
          <div class="column-content">
            <div 
              class="list-item" 
              *ngFor="let role of roles"
              [class.selected]="selectedRole?.id === role.id"
              (click)="selectRole(role)"
            >
              <div class="item-info">
                <input 
                  type="checkbox" 
                  class="role-checkbox"
                  [checked]="isUserHasRole(role.id)"
                  (click)="$event.stopPropagation()"
                  (change)="toggleUserRole(role.id, $event)"
                  [disabled]="!selectedUser"
                />
                <div class="item-details">
                  <span class="item-name">{{ role.roleName }}</span>
                  <span class="item-desc">{{ role.description }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="column">
          <div class="column-header">
            <h3 class="column-title">权限列表</h3>
          </div>
          <div class="column-content">
            <table class="permission-table">
              <thead>
                <tr>
                  <th>权限名称</th>
                  <th width="60">勾选</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let perm of permissions">
                  <td>
                    <div class="perm-info">
                      <span class="perm-name">{{ perm.permissionName }}</span>
                      <span class="perm-code">{{ perm.permissionCode }}</span>
                    </div>
                  </td>
                  <td>
                    <input 
                      type="checkbox"
                      [checked]="isRoleHasPermission(perm.id)"
                      (change)="toggleRolePermission(perm.id, $event)"
                      [disabled]="!selectedRole"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-overlay" *ngIf="roleModalVisible">
      <div class="modal-container">
        <div class="modal-header">
          <span class="modal-title">{{ roleModalMode === 'add' ? '新增角色' : '编辑角色' }}</span>
          <span class="modal-close" (click)="closeRoleModal()">×</span>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label class="form-label">角色名称</label>
            <input type="text" class="form-input" [(ngModel)]="roleForm.roleName" />
          </div>
          <div class="form-row">
            <label class="form-label">角色编码</label>
            <input type="text" class="form-input" [(ngModel)]="roleForm.roleCode" />
          </div>
          <div class="form-row">
            <label class="form-label">描述</label>
            <textarea class="form-input textarea" [(ngModel)]="roleForm.description"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" (click)="closeRoleModal()">取消</button>
          <button class="btn btn-confirm" (click)="saveRole()">确定</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .permission-container {
      height: 100%;
    }
    .three-column-layout {
      display: flex;
      gap: 16px;
      height: calc(100vh - 160px);
    }
    .column {
      flex: 1;
      background: white;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    .column-header {
      padding: 16px 20px;
      border-bottom: 1px solid #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .column-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }
    .column-actions {
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
    .btn-sm {
      padding: 4px 10px;
      font-size: 12px;
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
    .btn-danger {
      background: #fef2f2;
      color: #ef4444;
    }
    .btn-danger:hover {
      background: #fee2e2;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .column-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .list-item {
      padding: 12px 16px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 4px;
    }
    .list-item:hover {
      background: #f9fafb;
    }
    .list-item.selected {
      background: #eff6ff;
    }
    .item-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .item-avatar {
      width: 36px;
      height: 36px;
      background: #3b82f6;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 14px;
      font-weight: 600;
      flex-shrink: 0;
    }
    .item-details {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .item-name {
      font-size: 14px;
      font-weight: 500;
      color: #111827;
    }
    .item-desc {
      font-size: 12px;
      color: #6b7280;
    }
    .role-checkbox {
      margin: 0;
    }
    .permission-table {
      width: 100%;
      border-collapse: collapse;
    }
    .permission-table th,
    .permission-table td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #f3f4f6;
      font-size: 14px;
    }
    .permission-table th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
    }
    .perm-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .perm-name {
      font-size: 14px;
      color: #111827;
    }
    .perm-code {
      font-size: 12px;
      color: #6b7280;
    }
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-container {
      width: 450px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }
    .modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .modal-title {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }
    .modal-close {
      font-size: 24px;
      color: #6b7280;
      cursor: pointer;
      line-height: 1;
    }
    .modal-body {
      padding: 20px;
    }
    .modal-footer {
      padding: 16px 20px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
    .btn-cancel {
      background: #f3f4f6;
      color: #374151;
    }
    .btn-cancel:hover {
      background: #e5e7eb;
    }
    .btn-confirm {
      background: #3b82f6;
      color: white;
    }
    .btn-confirm:hover {
      background: #2563eb;
    }
    .form-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 16px;
    }
    .form-row:last-child {
      margin-bottom: 0;
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
export class PermissionComponent implements OnInit {
  users: User[] = [];
  roles: Role[] = [];
  permissions: Permission[] = [];

  selectedUser: User | null = null;
  selectedRole: Role | null = null;

  userRoleMap: Record<string, string[]> = {};
  rolePermissionMap: Record<string, string[]> = {};

  roleModalVisible = false;
  roleModalMode: 'add' | 'edit' = 'add';
  roleForm = {
    roleName: '',
    roleCode: '',
    description: ''
  };

  constructor(private httpService: HttpService) {}

  ngOnInit(): void {
    this.loadUsers();
    this.loadRoles();
    this.loadPermissions();
  }

  loadUsers(): void {
    this.users = [
      { id: '1', username: 'admin', realName: '管理员', department: '技术部' },
      { id: '2', username: 'zhangsan', realName: '张三', department: '财务部' },
      { id: '3', username: 'lisi', realName: '李四', department: '市场部' },
      { id: '4', username: 'wangwu', realName: '王五', department: '技术部' },
      { id: '5', username: 'zhaoliu', realName: '赵六', department: '人事部' }
    ];
    this.userRoleMap = {
      '1': ['1'],
      '2': ['2'],
      '3': ['2', '3']
    };
  }

  loadRoles(): void {
    this.roles = [
      { id: '1', roleCode: 'ADMIN', roleName: '超级管理员', description: '系统超级管理员，拥有所有权限' },
      { id: '2', roleCode: 'USER', roleName: '普通用户', description: '普通用户，拥有基本查看权限' },
      { id: '3', roleCode: 'AUDITOR', roleName: '审批员', description: '审批员，拥有审批权限' }
    ];
    this.rolePermissionMap = {
      '1': ['1', '2', '3', '4'],
      '2': ['1'],
      '3': ['1', '3']
    };
  }

  loadPermissions(): void {
    this.permissions = [
      { id: '1', permissionCode: 'asset:view', permissionName: '查看资产', resourceType: 'asset', action: 'view' },
      { id: '2', permissionCode: 'asset:edit', permissionName: '编辑资产', resourceType: 'asset', action: 'edit' },
      { id: '3', permissionCode: 'asset:delete', permissionName: '删除资产', resourceType: 'asset', action: 'delete' },
      { id: '4', permissionCode: 'user:manage', permissionName: '用户管理', resourceType: 'user', action: 'manage' },
      { id: '5', permissionCode: 'approval:handle', permissionName: '审批处理', resourceType: 'approval', action: 'handle' }
    ];
  }

  selectUser(user: User): void {
    this.selectedUser = user;
  }

  selectRole(role: Role): void {
    this.selectedRole = role;
  }

  isUserHasRole(roleId: string): boolean {
    if (!this.selectedUser) return false;
    return this.userRoleMap[this.selectedUser.id]?.includes(roleId) || false;
  }

  toggleUserRole(roleId: string, event: Event): void {
    if (!this.selectedUser) return;
    const checked = (event.target as HTMLInputElement).checked;
    const userId = this.selectedUser.id;
    
    if (!this.userRoleMap[userId]) {
      this.userRoleMap[userId] = [];
    }
    
    if (checked) {
      if (!this.userRoleMap[userId].includes(roleId)) {
        this.userRoleMap[userId].push(roleId);
      }
    } else {
      this.userRoleMap[userId] = this.userRoleMap[userId].filter(id => id !== roleId);
    }
  }

  isRoleHasPermission(permId: string): boolean {
    if (!this.selectedRole) return false;
    return this.rolePermissionMap[this.selectedRole.id]?.includes(permId) || false;
  }

  toggleRolePermission(permId: string, event: Event): void {
    if (!this.selectedRole) return;
    const checked = (event.target as HTMLInputElement).checked;
    const roleId = this.selectedRole.id;
    
    if (!this.rolePermissionMap[roleId]) {
      this.rolePermissionMap[roleId] = [];
    }
    
    if (checked) {
      if (!this.rolePermissionMap[roleId].includes(permId)) {
        this.rolePermissionMap[roleId].push(permId);
      }
    } else {
      this.rolePermissionMap[roleId] = this.rolePermissionMap[roleId].filter(id => id !== permId);
    }
  }

  openRoleModal(mode: 'add' | 'edit'): void {
    this.roleModalMode = mode;
    if (mode === 'edit' && this.selectedRole) {
      this.roleForm = {
        roleName: this.selectedRole.roleName,
        roleCode: this.selectedRole.roleCode,
        description: this.selectedRole.description
      };
    } else {
      this.roleForm = { roleName: '', roleCode: '', description: '' };
    }
    this.roleModalVisible = true;
  }

  closeRoleModal(): void {
    this.roleModalVisible = false;
  }

  saveRole(): void {
    if (this.roleModalMode === 'add') {
      const newRole: Role = {
        id: String(Date.now()),
        roleCode: this.roleForm.roleCode,
        roleName: this.roleForm.roleName,
        description: this.roleForm.description
      };
      this.roles.push(newRole);
    } else if (this.selectedRole) {
      this.selectedRole.roleName = this.roleForm.roleName;
      this.selectedRole.roleCode = this.roleForm.roleCode;
      this.selectedRole.description = this.roleForm.description;
    }
    this.closeRoleModal();
  }

  deleteRole(): void {
    if (!this.selectedRole) return;
    if (confirm(`确定要删除角色 ${this.selectedRole.roleName} 吗？`)) {
      this.roles = this.roles.filter(r => r.id !== this.selectedRole!.id);
      this.selectedRole = null;
    }
  }
}
