import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      {
        path: '',
        redirectTo: 'workspace',
        pathMatch: 'full'
      },
      {
        path: 'workspace',
        loadComponent: () => import('./workspace/workspace.component').then(m => m.WorkspaceComponent)
      },
      {
        path: 'archive',
        loadComponent: () => import('./archive/archive.component').then(m => m.ArchiveComponent)
      },
      {
        path: 'archive/:id',
        loadComponent: () => import('./archive/archive-detail/archive-detail.component').then(m => m.ArchiveDetailComponent)
      },
      {
        path: 'permission',
        loadComponent: () => import('./permission/permission.component').then(m => m.PermissionComponent)
      },
      {
        path: 'circulation',
        loadComponent: () => import('./circulation/circulation.component').then(m => m.CirculationComponent)
      },
      {
        path: 'version',
        loadComponent: () => import('./version/version.component').then(m => m.VersionComponent)
      },
      {
        path: 'approval',
        loadComponent: () => import('./approval/approval.component').then(m => m.ApprovalComponent)
      },
      {
        path: 'notifications',
        loadComponent: () => import('./notification/notification.component').then(m => m.NotificationComponent)
      }
    ]
  }
];
