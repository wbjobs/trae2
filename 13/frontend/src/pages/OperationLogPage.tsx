import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { logService } from '../services';
import { OperationLog } from '@shared/types';
import { Search, Filter, RefreshCw, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

const actionLabels: Record<string, string> = {
  login: '用户登录',
  logout: '用户登出',
  create_user: '创建用户',
  update_user: '更新用户',
  delete_user: '删除用户',
  create_specimen: '创建标本',
  update_specimen: '更新标本',
  delete_specimen: '删除标本',
  upload_file: '上传文件',
  delete_file: '删除文件',
  create_annotation: '创建批注',
  rollback_version: '回滚版本',
  create_tag: '创建标签',
  update_tag: '更新标签',
  delete_tag: '删除标签'
};

const resourceTypeLabels: Record<string, string> = {
  user: '用户',
  specimen: '标本',
  file: '文件',
  annotation: '批注',
  version: '版本',
  tag: '标签'
};

const OperationLogPage: React.FC = () => {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [filters, setFilters] = useState({
    action: '',
    resourceType: '',
    startDate: '',
    endDate: ''
  });
  const [stats, setStats] = useState<any>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await logService.list({
        page,
        pageSize,
        ...filters
      });
      
      if (response.data.success) {
        setLogs(response.data.data || []);
        setTotal(response.data.pagination?.total || 0);
      }
    } catch (error) {
      console.error('获取操作日志失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await logService.stats();
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('获取日志统计失败:', error);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchLogs();
      fetchStats();
    }
  }, [fetchLogs, fetchStats, user?.role]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleReset = () => {
    setFilters({
      action: '',
      resourceType: '',
      startDate: '',
      endDate: ''
    });
    setPage(1);
  };

  const totalPages = Math.ceil(total / pageSize);

  const actionOptions = useMemo(() => {
    return Object.entries(actionLabels).map(([value, label]) => ({ value, label }));
  }, []);

  const resourceTypeOptions = useMemo(() => {
    return Object.entries(resourceTypeLabels).map(([value, label]) => ({ value, label }));
  }, []);

  if (user?.role !== 'admin') {
    return (
      <div className="p-6 text-center text-gray-500">
        您没有权限访问此页面
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">操作日志</h1>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">总记录数</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">今日操作</p>
            <p className="text-2xl font-bold text-blue-600">{stats.today}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">本周操作</p>
            <p className="text-2xl font-bold text-green-600">{stats.thisWeek}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">在线用户</p>
            <p className="text-2xl font-bold text-orange-500">{Object.keys(stats.byUser || {}).length}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-400" />
              <span className="text-sm text-gray-600">筛选:</span>
            </div>

            <select
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部操作类型</option>
              {actionOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              value={filters.resourceType}
              onChange={(e) => handleFilterChange('resourceType', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部资源类型</option>
              {resourceTypeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="开始日期"
            />

            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="结束日期"
            />

            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              重置
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">资源类型</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">资源ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">详情</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP地址</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    加载中...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    暂无数据
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {log.user?.realName || log.user?.username || '未知'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {actionLabels[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {log.resourceType ? (resourceTypeLabels[log.resourceType] || log.resourceType) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {log.resourceId || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                      {log.details ? JSON.stringify(log.details) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {log.ipAddress || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              共 {total} 条记录，第 {page}/{totalPages} 页
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-gray-600">{page}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OperationLogPage;
