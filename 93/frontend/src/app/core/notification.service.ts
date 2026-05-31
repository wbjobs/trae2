import { Injectable } from '@angular/core';
import { HttpService } from './http.service';
import { Observable } from 'rxjs';
import { Notification, NotificationCount } from '../models/notification.model';
import { Result, PageResult } from '../models/common.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  constructor(private http: HttpService) {}

  getNotifications(isRead?: boolean, page = 1, size = 10): Observable<Result<PageResult<Notification>>> {
    let url = `/notifications?page=${page}&size=${size}`;
    if (isRead !== undefined) {
      url += `&isRead=${isRead}`;
    }
    return this.http.get<Result<PageResult<Notification>>>(url);
  }

  getCount(): Observable<Result<NotificationCount>> {
    return this.http.get<Result<NotificationCount>>('/notifications/count');
  }

  markAsRead(id: string): Observable<Result<void>> {
    return this.http.put<Result<void>>(`/notifications/${id}/read`);
  }

  markAllAsRead(): Observable<Result<void>> {
    return this.http.put<Result<void>>('/notifications/read-all');
  }

  delete(id: string): Observable<Result<void>> {
    return this.http.delete<Result<void>>(`/notifications/${id}`);
  }
}
