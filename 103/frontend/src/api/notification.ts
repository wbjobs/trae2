import request from '@/utils/request'

export function getNotificationList(params?: any) {
  return request({
    url: '/notifications/',
    method: 'get',
    params,
  })
}

export function markAsRead(id: string) {
  return request({
    url: `/notifications/${id}/read/`,
    method: 'patch',
  })
}

export function markAllAsRead() {
  return request({
    url: '/notifications/read-all/',
    method: 'post',
  })
}

export function getUnreadCount() {
  return request({
    url: '/notifications/unread-count/',
    method: 'get',
  })
}
