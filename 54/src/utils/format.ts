export const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const formatDateTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const formatNumber = (num: number, decimals: number = 2): string => {
  return num.toFixed(decimals);
};

export const getRiskColor = (level: string): string => {
  switch (level) {
    case 'critical':
      return '#ff3366';
    case 'high':
      return '#ff6b35';
    case 'medium':
      return '#ffc107';
    case 'low':
      return '#4caf50';
    default:
      return '#4caf50';
  }
};

export const getRiskBgColor = (level: string): string => {
  switch (level) {
    case 'critical':
      return 'rgba(255, 51, 102, 0.15)';
    case 'high':
      return 'rgba(255, 107, 53, 0.15)';
    case 'medium':
      return 'rgba(255, 193, 7, 0.15)';
    case 'low':
      return 'rgba(76, 175, 80, 0.15)';
    default:
      return 'rgba(76, 175, 80, 0.15)';
  }
};

export const getRiskLabel = (level: string): string => {
  switch (level) {
    case 'critical':
      return '危险';
    case 'high':
      return '高风险';
    case 'medium':
      return '中风险';
    case 'low':
      return '低风险';
    default:
      return '正常';
  }
};

export const getTrendIcon = (trend: string): string => {
  switch (trend) {
    case 'rising':
      return '↑';
    case 'falling':
      return '↓';
    default:
      return '→';
  }
};

export const getTrendColor = (trend: string): string => {
  switch (trend) {
    case 'rising':
      return '#ff6b35';
    case 'falling':
      return '#4caf50';
    default:
      return '#00d4ff';
  }
};
