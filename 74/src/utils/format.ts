export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

export function formatNumber(num: number, decimals: number = 0): string {
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

export function formatPercent(num: number): string {
  return `${formatNumber(num, 1)}%`;
}

export function getDeviceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    camera: '摄像头',
    access: '门禁',
    alarm: '报警器'
  };
  return labels[type] || type;
}

export function getDeviceTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    camera: '📹',
    access: '🚪',
    alarm: '🚨'
  };
  return icons[type] || '📊';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    normal: '正常',
    warning: '警告',
    danger: '危险',
    online: '在线',
    offline: '离线',
    fault: '故障'
  };
  return labels[status] || status;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    normal: 'text-green-400',
    warning: 'text-yellow-400',
    danger: 'text-red-400',
    online: 'text-green-400',
    offline: 'text-gray-400',
    fault: 'text-red-400',
    safe: 'text-green-400',
    caution: 'text-yellow-400',
    high: 'text-red-400',
    medium: 'text-yellow-400',
    low: 'text-blue-400'
  };
  return colors[status] || 'text-blue-400';
}

export function getStatusBgColor(status: string): string {
  const colors: Record<string, string> = {
    normal: 'bg-green-500/20 border-green-500/50',
    warning: 'bg-yellow-500/20 border-yellow-500/50',
    danger: 'bg-red-500/20 border-red-500/50',
    safe: 'bg-green-500/20 border-green-500/50',
    caution: 'bg-yellow-500/20 border-yellow-500/50',
    high: 'bg-red-500/20 border-red-500/50',
    medium: 'bg-yellow-500/20 border-yellow-500/50',
    low: 'bg-blue-500/20 border-blue-500/50'
  };
  return colors[status] || 'bg-blue-500/20 border-blue-500/50';
}

export function getRiskLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    safe: '安全',
    caution: '注意',
    danger: '危险'
  };
  return labels[level] || level;
}

export function getAnomalyTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    intrusion: '异常入侵',
    gathering: '异常聚集',
    fault: '设备故障',
    other: '其他异常'
  };
  return labels[type] || type;
}

export function getSeverityLabel(level: string): string {
  const labels: Record<string, string> = {
    low: '低危',
    medium: '中危',
    high: '高危'
  };
  return labels[level] || level;
}

export function getAlertStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待处理',
    processing: '处理中',
    resolved: '已解决',
    ignored: '已忽略'
  };
  return labels[status] || status;
}

export function getTimeRangeLabel(range: string): string {
  const labels: Record<string, string> = {
    '1h': '最近1小时',
    '6h': '最近6小时',
    '24h': '最近24小时',
    '7d': '最近7天'
  };
  return labels[range] || range;
}

export function getTrendIcon(trend: string): string {
  const icons: Record<string, string> = {
    up: '↑',
    down: '↓',
    stable: '→'
  };
  return icons[trend] || '→';
}

export function getTrendColor(trend: string): string {
  const colors: Record<string, string> = {
    up: 'text-red-400',
    down: 'text-green-400',
    stable: 'text-blue-400'
  };
  return colors[trend] || 'text-blue-400';
}
