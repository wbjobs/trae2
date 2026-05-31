import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Table, Tag, Button, Select, DatePicker, Space, Input, message, Modal, Descriptions, Statistic, Tooltip } from 'antd';
import { FileTextOutlined, ReloadOutlined, DownloadOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/index.js';

const ACTION_OPTIONS = [
  { value: 'login', label: '登录' },
  { value: 'logout', label: '登出' },
  { value: 'rule_add', label: '新增规则' },
  { value: 'rule_update', label: '更新规则' },
  { value: 'rule_delete', label: '删除规则' },
  { value: 'rule_toggle', label: '规则启停' },
  { value: 'node_register', label: '节点注册' },
  { value: 'node_unregister', label: '节点注销' },
  { value: 'node_heartbeat', label: '节点心跳' },
  { value: 'link_reset', label: '链路重置' },
  { value: 'sync_push', label: '同步推送' },
  { value: 'sync_pull', label: '同步拉取' },
  { value: 'sync_broadcast', label: '同步广播' },
  { value: 'signal_ack', label: '信令确认' },
  { value: 'signal_retry', label: '信令重传' },
  { value: 'config_change', label: '配置变更' },
  { value: 'system_start', label: '系统启动' },
  { value: 'system_stop', label: '系统停止' },
];

const ENTITY_TYPE_OPTIONS = [
  { value: 'system', label: '系统' },
  { value: 'rule', label: '规则' },
  { value: 'node', label: '节点' },
  { value: 'link', label: '链路' },
  { value: 'signal', label: '信令' },
  { value: 'user', label: '用户' },
  { value: 'config', label: '配置' },
];

const ACTION_COLORS = {
  login: 'green',
  logout: 'default',
  rule_add: 'blue',
  rule_update: 'geekblue',
  rule_delete: 'red',
  rule_toggle: 'orange',
  node_register: 'green',
  node_unregister: 'red',
  node_heartbeat: 'cyan',
  link_reset: 'volcano',
  sync_push: 'blue',
  sync_pull: 'purple',
  sync_broadcast: 'magenta',
  signal_ack: 'green',
  signal_retry: 'orange',
  config_change: 'gold',
  system_start: 'green',
  system_stop: 'red',
};

export default function AuditLog() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [filters, setFilters] = useState({
    action: undefined,
    entityType: undefined,
    operator: undefined,
    startTime: undefined,
    endTime: undefined,
    keyword: undefined,
  });
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {
        limit: pagination.pageSize,
        offset: (pagination.current - 1) * pagination.pageSize,
      };
      if (filters.action) params.action = filters.action;
      if (filters.entityType) params.entityType = filters.entityType;
      if (filters.operator) params.operator = filters.operator;
      if (filters.startTime) params.startTime = filters.startTime.valueOf();
      if (filters.endTime) params.endTime = filters.endTime.valueOf();
      if (filters.keyword) params.keyword = filters.keyword;

      const [logsRes, statsRes] = await Promise.all([
        api.audit.logs(params).catch(() => ({ data: { logs: [], total: 0 } })),
        api.audit.stats().catch(() => ({ data: { data: null } })),
      ]);

      setLogs(logsRes.data?.logs || []);
      setTotal(logsRes.data?.total || 0);
      setStats(statsRes.data?.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [pagination.current, pagination.pageSize]);

  const handleExport = async (format) => {
    try {
      const res = await api.audit.export({ format });
      const blob = new Blob([res.data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-export-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (err) {
      message.error('导出失败: ' + err.message);
    }
  };

  const columns = [
    {
      title: '操作类型',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: (a) => <Tag color={ACTION_COLORS[a] || 'default'}>{a}</Tag>,
    },
    {
      title: '实体类型',
      dataIndex: 'entityType',
      key: 'entityType',
      width: 90,
      render: (t) => {
        const opt = ENTITY_TYPE_OPTIONS.find(o => o.value === t);
        return <Tag>{opt?.label || t}</Tag>;
      },
    },
    { title: '实体ID', dataIndex: 'entityId', key: 'entityId', width: 120, render: (v) => v || '-' },
    { title: '操作员', dataIndex: 'operator', key: 'operator', width: 120 },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      ellipsis: true,
      render: (v) => {
        try {
          const parsed = JSON.parse(v);
          return typeof parsed === 'object' ? JSON.stringify(parsed).substring(0, 60) + '...' : v.substring(0, 60);
        } catch {
          return v?.substring(0, 60) || '-';
        }
      },
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 160,
      render: (t) => t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 60,
      render: (_, record) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelectedLog(record); setDetailVisible(true); }}>详情</Button>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <FileTextOutlined style={{ fontSize: 28, color: '#1677ff' }} />
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1677ff', margin: '8px 0' }}>{stats?.totalRecords || 0}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>总记录数</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#52c41a', margin: '8px 0' }}>{stats?.bufferSize || 0}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>缓冲区</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#722ed1', margin: '8px 0' }}>{stats?.archivedFiles?.length || 0}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>归档文件</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <Tooltip title="导出日志">
              <Space>
                <Button icon={<DownloadOutlined />} onClick={() => handleExport('json')}>JSON</Button>
                <Button icon={<DownloadOutlined />} onClick={() => handleExport('csv')}>CSV</Button>
              </Space>
            </Tooltip>
          </Card>
        </Col>
      </Row>

      <Card
        title="操作日志"
        style={{ marginTop: 16 }}
        extra={
          <Space>
            <Select
              placeholder="操作类型"
              allowClear
              style={{ width: 130 }}
              value={filters.action}
              onChange={(v) => setFilters(f => ({ ...f, action: v }))}
              options={ACTION_OPTIONS}
            />
            <Select
              placeholder="实体类型"
              allowClear
              style={{ width: 110 }}
              value={filters.entityType}
              onChange={(v) => setFilters(f => ({ ...f, entityType: v }))}
              options={ENTITY_TYPE_OPTIONS}
            />
            <Input
              placeholder="操作员"
              allowClear
              style={{ width: 110 }}
              value={filters.operator}
              onChange={(e) => setFilters(f => ({ ...f, operator: e.target.value }))}
            />
            <DatePicker.RangePicker
              style={{ width: 260 }}
              value={[filters.startTime ? dayjs(filters.startTime) : null, filters.endTime ? dayjs(filters.endTime) : null]}
              onChange={(dates) => setFilters(f => ({ ...f, startTime: dates?.[0], endTime: dates?.[1] }))}
            />
            <Input
              placeholder="关键字搜索"
              allowClear
              style={{ width: 140 }}
              prefix={<SearchOutlined />}
              value={filters.keyword}
              onChange={(e) => setFilters(f => ({ ...f, keyword: e.target.value }))}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={loadData}>查询</Button>
            <Button icon={<ReloadOutlined />} onClick={() => { setFilters({ action: undefined, entityType: undefined, operator: undefined, startTime: undefined, endTime: undefined, keyword: undefined }); loadData(); }}>重置</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
          }}
        />
      </Card>

      <Modal
        title="审计日志详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={600}
      >
        {selectedLog && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="日志ID">{selectedLog.id}</Descriptions.Item>
            <Descriptions.Item label="操作类型">{selectedLog.action}</Descriptions.Item>
            <Descriptions.Item label="实体类型">{selectedLog.entityType}</Descriptions.Item>
            <Descriptions.Item label="实体ID">{selectedLog.entityId || '-'}</Descriptions.Item>
            <Descriptions.Item label="操作员">{selectedLog.operator}</Descriptions.Item>
            <Descriptions.Item label="时间">{selectedLog.timestamp ? dayjs(selectedLog.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS') : '-'}</Descriptions.Item>
            <Descriptions.Item label="详情">
              <pre style={{ maxHeight: 200, overflow: 'auto', fontSize: 12, background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                {selectedLog.detail}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
