import { formatTime, formatDate, formatFileSize, getDuration } from '@/utils'

export function formatTimeFilter(val: string | Date) {
  return formatTime(val)
}

export function formatDateFilter(val: string | Date) {
  return formatDate(val)
}

export function formatFileSizeFilter(val: number) {
  return formatFileSize(val)
}

export function formatDurationFilter(start: string | Date, end: string | Date) {
  if (!start || !end) return '-'
  return getDuration(start, end)
}

export function reservationStatusFilter(status: string) {
  const statusMap: Record<string, { text: string; type: string }> = {
    pending: { text: '待审核', type: 'warning' },
    approved: { text: '已通过', type: 'success' },
    rejected: { text: '已拒绝', type: 'danger' },
    cancelled: { text: '已取消', type: 'info' },
    completed: { text: '已完成', type: 'success' },
    in_progress: { text: '进行中', type: 'primary' },
  }
  return statusMap[status]?.text || status
}

export function instrumentStatusFilter(status: string) {
  const statusMap: Record<string, { text: string; type: string }> = {
    available: { text: '可用', type: 'success' },
    in_use: { text: '使用中', type: 'primary' },
    maintenance: { text: '维护中', type: 'warning' },
    unavailable: { text: '不可用', type: 'danger' },
  }
  return statusMap[status]?.text || status
}

export function notificationTypeFilter(type: string) {
  const typeMap: Record<string, string> = {
    reservation: '预约通知',
    approval: '审批通知',
    system: '系统通知',
    file: '文件通知',
  }
  return typeMap[type] || type
}

export function roleFilter(roleCode: string) {
  const roleMap: Record<string, string> = {
    super_admin: '超级管理员',
    lab_admin: '实验室管理员',
    researcher: '科研人员',
    user: '普通用户',
  }
  return roleMap[roleCode] || roleCode
}
