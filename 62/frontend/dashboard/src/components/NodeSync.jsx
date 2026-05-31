import React, { useState, useEffect, useMemo } from 'react';
import { Row, Col, Card, Table, Tag, Button, Modal, Descriptions, Space, message, Spin, Statistic, Progress, Tabs, Empty } from 'antd';
import { ClusterOutlined, ReloadOutlined, SyncOutlined, RocketOutlined, DashboardOutlined, CloudOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import api from '../api/index.js';

const NODE_TYPE_LABELS = {
  onboard: '车载终端',
  station: '车站节点',
  occ: '运营中心',
};

const NODE_TYPE_COLORS = {
  onboard: 'blue',
  station: 'green',
  occ: 'purple',
};

const STATUS_COLORS = {
  online: 'green',
  offline: 'red',
  degraded: 'orange',
};

export default function NodeSync({ wsMessages }) {
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [changes, setChanges] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('nodes');

  const loadData = async () => {
    setLoading(true);
    try {
      const [nodesRes, statusRes, snapshotsRes, changesRes] = await Promise.all([
        api.nodes.list().catch(() => ({ data: { data: [] } })),
        api.sync.status().catch(() => ({ data: { data: null } })),
        api.sync.snapshots().catch(() => ({ data: { data: [] } })),
        api.sync.changes({ limit: 30 }).catch(() => ({ data: { data: [] } })),
      ]);
      setNodes(nodesRes.data?.data || []);
      setSyncStatus(statusRes.data?.data);
      setSnapshots(snapshotsRes.data?.data || []);
      setChanges(changesRes.data?.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 10000);
    return () => clearInterval(timer);
  }, []);

  const handleHeartbeat = async (id) => {
    try {
      await api.nodes.heartbeat(id);
      message.success('心跳已发送');
      loadData();
    } catch (err) {
      message.error('心跳失败: ' + err.message);
    }
  };

  const handleBatchPush = async () => {
    try {
      await api.sync.batchPush({ nodeId: 'node-all', items: [{ type: 'test', data: {} }] });
      message.success('批量推送已触发');
      loadData();
    } catch (err) {
      message.error('推送失败: ' + err.message);
    }
  };

  const nodeColumns = [
    { title: '节点名称', dataIndex: 'name', key: 'name', width: 140 },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (t) => <Tag color={NODE_TYPE_COLORS[t] || 'default'}>{NODE_TYPE_LABELS[t] || t}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s) => <Tag color={STATUS_COLORS[s] || 'default'}>{s === 'online' ? '在线' : s === 'offline' ? '离线' : '降级'}</Tag>,
    },
    { title: 'IP地址', dataIndex: 'ip', key: 'ip', width: 130 },
    {
      title: '最后心跳',
      dataIndex: 'lastHeartbeat',
      key: 'lastHeartbeat',
      width: 160,
      render: (t) => t ? new Date(t).toLocaleString('zh-CN') : '-',
    },
    {
      title: '负载',
      dataIndex: 'load',
      key: 'load',
      width: 120,
      render: (v) => v != null ? (
        <Progress percent={v} size="small" status={v > 80 ? 'exception' : v > 60 ? 'normal' : 'success'} />
      ) : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<SyncOutlined />} onClick={() => handleHeartbeat(record.id)}>心跳</Button>
          <Button size="small" onClick={() => { setSelectedNode(record); setDetailVisible(true); }}>详情</Button>
        </Space>
      ),
    },
  ];

  const changeColumns = [
    { title: '类型', dataIndex: 'type', key: 'type', width: 120, render: (t) => <Tag>{t}</Tag> },
    { title: '实体ID', dataIndex: 'entityId', key: 'entityId', width: 140 },
    {
      title: '变更字段',
      key: 'fields',
      render: (_, record) => (
        <Space size={4}>
          {(record.changedFields || []).map((f, i) => (
            <Tag key={i} color="blue">{f}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 160,
      render: (t) => t ? new Date(t).toLocaleString('zh-CN') : '-',
    },
  ];

  const nodeTypeOption = useMemo(() => {
    const types = ['onboard', 'station', 'occ'];
    return {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        label: { formatter: '{b}: {c}' },
        data: types.map(t => ({
          name: NODE_TYPE_LABELS[t],
          value: nodes.filter(n => n.type === t).length,
        })),
        color: ['#1677ff', '#52c41a', '#722ed1'],
      }],
    };
  }, [nodes]);

  const nodeStatusOption = useMemo(() => ({
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      label: { formatter: '{b}: {c}' },
      data: [
        { name: '在线', value: nodes.filter(n => n.status === 'online').length },
        { name: '离线', value: nodes.filter(n => n.status === 'offline').length },
        { name: '降级', value: nodes.filter(n => n.status === 'degraded').length },
      ],
      color: ['#52c41a', '#ff4d4f', '#faad14'],
    }],
  }), [nodes]);

  const summaryStats = useMemo(() => {
    const total = nodes.length;
    const online = nodes.filter(n => n.status === 'online').length;
    return { total, online, offline: total - online };
  }, [nodes]);

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <ClusterOutlined style={{ fontSize: 28, color: '#1677ff' }} />
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1677ff', margin: '8px 0' }}>{summaryStats.total}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>总节点数</div>
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <DashboardOutlined style={{ fontSize: 28, color: '#52c41a' }} />
            <div style={{ fontSize: 28, fontWeight: 700, color: '#52c41a', margin: '8px 0' }}>{summaryStats.online}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>在线节点</div>
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <RocketOutlined style={{ fontSize: 28, color: '#faad14' }} />
            <div style={{ fontSize: 28, fontWeight: 700, color: '#faad14', margin: '8px 0' }}>{syncStatus?.avgSyncTime || 0}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>平均同步延迟(ms)</div>
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'nodes',
              label: '节点列表',
              children: (
                <Table
                  columns={nodeColumns}
                  dataSource={nodes}
                  rowKey="id"
                  size="small"
                  loading={loading}
                  pagination={{ pageSize: 10, size: 'small' }}
                />
              ),
            },
            {
              key: 'changes',
              label: '同步变更',
              children: changes.length === 0 ? (
                <Empty description="暂无同步变更" style={{ padding: 40 }} />
              ) : (
                <Table
                  columns={changeColumns}
                  dataSource={changes}
                  rowKey="id"
                  size="small"
                  loading={loading}
                  pagination={{ pageSize: 10, size: 'small' }}
                />
              ),
            },
            {
              key: 'snapshots',
              label: '快照列表',
              children: snapshots.length === 0 ? (
                <Empty description="暂无快照" style={{ padding: 40 }} />
              ) : (
                <Table
                  dataSource={snapshots}
                  rowKey="id"
                  size="small"
                  loading={loading}
                  pagination={{ pageSize: 10, size: 'small' }}
                  columns={[
                    { title: '快照ID', dataIndex: 'id', key: 'id' },
                    { title: '节点数', dataIndex: 'nodeCount', key: 'nodeCount', width: 100 },
                    { title: '变更数', dataIndex: 'changeCount', key: 'changeCount', width: 100 },
                    {
                      title: '创建时间',
                      dataIndex: 'createdAt',
                      key: 'createdAt',
                      render: (t) => t ? new Date(t).toLocaleString('zh-CN') : '-',
                    },
                  ]}
                />
              ),
            },
            {
              key: 'stats',
              label: '节点分布',
              children: (
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12}>
                    <Card title="节点类型分布">
                      <ReactECharts option={nodeTypeOption} style={{ height: 280 }} />
                    </Card>
                  </Col>
                  <Col xs={24} md={12}>
                    <Card title="节点状态分布">
                      <ReactECharts option={nodeStatusOption} style={{ height: 280 }} />
                    </Card>
                  </Col>
                </Row>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="节点详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={600}
      >
        {selectedNode && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="节点ID">{selectedNode.id}</Descriptions.Item>
            <Descriptions.Item label="名称">{selectedNode.name}</Descriptions.Item>
            <Descriptions.Item label="类型">{NODE_TYPE_LABELS[selectedNode.type] || selectedNode.type}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={STATUS_COLORS[selectedNode.status] || 'default'}>{selectedNode.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="IP地址">{selectedNode.ip}</Descriptions.Item>
            <Descriptions.Item label="端口">{selectedNode.port}</Descriptions.Item>
            <Descriptions.Item label="最后心跳">{selectedNode.lastHeartbeat ? new Date(selectedNode.lastHeartbeat).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
            <Descriptions.Item label="负载">{selectedNode.load}%</Descriptions.Item>
            <Descriptions.Item label="版本" span={2}>{selectedNode.version}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
