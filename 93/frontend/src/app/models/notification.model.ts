export enum NotificationType {
  BORROW_DUE = 'BORROW_DUE',
  BORROW_OVERDUE = 'BORROW_OVERDUE',
  APPROVAL = 'APPROVAL',
  APPROVED = 'APPROVED'
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  relatedId: string;
  isRead: boolean;
  createdAt: Date;
}

export interface NotificationCount {
  total: number;
  unread: number;
}
