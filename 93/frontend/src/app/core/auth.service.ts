import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();

  constructor() {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      this.currentUserSubject.next(JSON.parse(storedUser));
    }
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  login(username: string, password: string): Observable<User> {
    const adminUser: User = {
      id: '1',
      username: 'admin',
      realName: '管理员',
      email: 'admin@example.com',
      phone: '13800138000',
      department: '技术部',
      status: 1,
      roles: [
        {
          id: '1',
          roleCode: 'ADMIN',
          roleName: '超级管理员',
          description: '系统超级管理员',
          level: 1,
          permissions: [
            {
              id: '1',
              permissionCode: 'asset:view',
              permissionName: '查看资产',
              resourceType: 'asset',
              action: 'view'
            },
            {
              id: '2',
              permissionCode: 'asset:edit',
              permissionName: '编辑资产',
              resourceType: 'asset',
              action: 'edit'
            },
            {
              id: '3',
              permissionCode: 'asset:delete',
              permissionName: '删除资产',
              resourceType: 'asset',
              action: 'delete'
            },
            {
              id: '4',
              permissionCode: 'user:manage',
              permissionName: '用户管理',
              resourceType: 'user',
              action: 'manage'
            }
          ]
        }
      ]
    };

    localStorage.setItem('token', 'mock-jwt-token-' + Date.now());
    localStorage.setItem('currentUser', JSON.stringify(adminUser));
    this.currentUserSubject.next(adminUser);

    return of(adminUser);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('token');
  }

  getToken(): string {
    return localStorage.getItem('token') || '';
  }

  hasRole(role: string): boolean {
    const user = this.currentUserSubject.value;
    if (!user || !user.roles) {
      return false;
    }
    return user.roles.some(r => r.roleCode === role);
  }
}
