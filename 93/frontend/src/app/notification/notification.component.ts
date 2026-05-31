import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationListComponent } from '../shared/components/notification-list.component';

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule, NotificationListComponent],
  template: `
    <div class="notification-page">
      <app-notification-list></app-notification-list>
    </div>
  `,
  styles: [`
    .notification-page {
      padding: 0;
    }
  `]
})
export class NotificationComponent {
}
