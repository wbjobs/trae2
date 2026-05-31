import dayjs from 'dayjs';

export function formatNumber(num: number, decimals: number = 2): string {
  if (!isFinite(num)) return '0';
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDate(date: string | Date, format: string = 'YYYY-MM-DD'): string {
  if (!date) return '';
  return dayjs(date).format(format);
}

export function formatDateTime(date: string | Date): string {
  return formatDate(date, 'YYYY-MM-DD HH:mm:ss');
}

export function formatScientific(num: number): string {
  if (!isFinite(num)) return '0';
  if (Math.abs(num) < 0.001 || Math.abs(num) >= 1000000) {
    return num.toExponential(2);
  }
  return formatNumber(num);
}

export function getTrophicLevelName(level: string): string {
  const map: Record<string, string> = {
    oligotrophic: '贫营养',
    mesotrophic: '中营养',
    eutrophic: '富营养',
    hypertrophic: '重富营养',
  };
  return map[level] || level;
}

export function getWaterQualityName(level: string): string {
  const map: Record<string, string> = {
    excellent: '优',
    good: '良',
    moderate: '中',
    poor: '差',
    bad: '极差',
  };
  return map[level] || level;
}

export function getStatusName(status: string): string {
  const map: Record<string, string> = {
    online: '在线',
    offline: '离线',
    maintenance: '维护中',
  };
  return map[status] || status;
}
