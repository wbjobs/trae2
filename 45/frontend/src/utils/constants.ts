export const CATEGORY_OPTIONS = [
  { value: 'dinosaur', label: '恐龙化石' },
  { value: 'paleobotany', label: '古植物化石' },
  { value: 'invertebrate', label: '无脊椎动物化石' },
  { value: 'vertebrate', label: '脊椎动物化石' },
  { value: 'trace', label: '遗迹化石' },
  { value: 'other', label: '其他' }
];

export const STATUS_OPTIONS = [
  { value: 'stored', label: '库房存储', type: 'info' },
  { value: 'exhibiting', label: '展览中', type: 'success' },
  { value: 'researching', label: '研究中', type: 'warning' },
  { value: 'restoring', label: '修复中', type: 'danger' },
  { value: 'transferred', label: '已外借', type: '' }
];

export const TRACE_TYPE_OPTIONS = [
  { value: 'create', label: '建档', color: '#67c23a' },
  { value: 'update', label: '更新', color: '#409eff' },
  { value: 'status_change', label: '状态变更', color: '#e6a23c' },
  { value: 'location_change', label: '位置变更', color: '#909399' },
  { value: 'loan', label: '借出', color: '#f56c6c' },
  { value: 'return', label: '归还', color: '#67c23a' },
  { value: 'exhibit', label: '展览', color: '#409eff' },
  { value: 'research', label: '研究', color: '#e6a23c' },
  { value: 'restore', label: '修复', color: '#f56c6c' },
  { value: 'transfer', label: '移交', color: '#909399' },
  { value: 'delete', label: '删除', color: '#f56c6c' }
];

export const ROLE_OPTIONS = [
  { value: 'admin', label: '系统管理员', color: '#f56c6c' },
  { value: 'curator', label: '标本管理员', color: '#e6a23c' },
  { value: 'researcher', label: '研究员', color: '#409eff' },
  { value: 'viewer', label: '普通用户', color: '#909399' }
];

export const ROLE_LABELS: Record<string, string> = {
  admin: '系统管理员',
  curator: '标本管理员',
  researcher: '研究员',
  viewer: '普通用户'
};

export const getCategoryLabel = (value: string) => {
  return CATEGORY_OPTIONS.find(opt => opt.value === value)?.label || value;
};

export const getStatusLabel = (value: string) => {
  return STATUS_OPTIONS.find(opt => opt.value === value)?.label || value;
};

export const getStatusType = (value: string) => {
  return STATUS_OPTIONS.find(opt => opt.value === value)?.type || '';
};

export const getTraceTypeLabel = (value: string) => {
  return TRACE_TYPE_OPTIONS.find(opt => opt.value === value)?.label || value;
};

export const getTraceTypeColor = (value: string) => {
  return TRACE_TYPE_OPTIONS.find(opt => opt.value === value)?.color || '#909399';
};

export const getRoleLabel = (value: string) => {
  return ROLE_OPTIONS.find(opt => opt.value === value)?.label || value;
};

export const getRoleColor = (value: string) => {
  return ROLE_OPTIONS.find(opt => opt.value === value)?.color || '#909399';
};

export const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
