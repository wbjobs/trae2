import React, { useState, useEffect, useMemo } from 'react';
import { Row, Col, Card, Table, Tag, Button, Modal, Descriptions, Progress, Space, message, Spin, Empty, Tabs } from 'antd';
import { LinkOutlined, ReloadOutlined, EyeOutlined, WarningOutlined, CheckCircleOutlined, DashboardOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import api from '../api/index.js';

const STATUS_COLORS = {
  NORMAL: 'green',
  WARNING: 'orange',
  CRITICAL: 'red',
  FATAL: 'volcano',
  DEGRADED: 'gold',
  UNKNOWN: 'default',
};

const LINK_TYPE_LABELS = {
  fiber: '光纤',
  wireless: '无线',
  copper: '铜缆',
};

export default function LinkAnalysis({ wsMessages }) {
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState([]);
  const [abnormal, setAbnormal] = useState([]);
  const [selectedLink, setSelectedLink] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [latencyHistory, setLatencyHistory] = useState([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [linksRes, abnormalRes] = await Promise.all([
        api.analysis.links().catch(() => ({ data: { data: { links: [] } } })),
        api.analysis.abnormal().catch(() => ({ data: { data: [] } })),
      ]);
      setLinks(linksRes.data?.data?.links || []);
      setAbnormal(abnormalRes.data?.data || []);

      const history = [];
      const now = Date.now();
      for (let i = 29; i >= 0; i--) {
        history.push({
          time: new Date(now - i * 60000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          normal: 8 + Math.floor(Math.random() * 3),
          warning: Math.floor(Math.random() * 3),
          critical: Math.floor(Math.random() * 2),
        });
      }
      setLatencyHistory(history);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 20000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!wsMessages?.length) return;
    const latest = wsMessages[wsMessages.length - 1];
    if (latest?.type === 'linkUpdate') {
      const link = latest.data;
      setLinks(prev => {
        const idx = prev.findIndex(l => l.id === link.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = link;
          return copy;
        }
        return [...prev, link];
      });
    }
  }, [wsMessages]);

  const handleReset = async (id) => {
    try {
      await api.links.reset(id);
      message.success('链路已重置');
      loadData();
    } catch (err) {
      message.error('重置失败: ' + err.message);
    }
  };

  const showDetail = (link) => {
    setSelectedLink(link);
    setDetailVisible(true);
  };

  const columns = [
    { title: '链路名称', dataIndex: 'name', key: 'name', width: 140 },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (t) => <Tag>{LINK_TYPE_LABELS[t] || t}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s) => <Tag color={STATUS_COLORS[s] || 'default'}>{s}</Tag>,
    },
    {
      title: '延迟(ms)',
      dataIndex: 'latency',
      key: 'latency',
      width: 90,
      sorter: (a, b) => (a.latency || 0) - (b.latency || 0),
      render: (v) => v?.toFixed(1) || '-',
    },
    {
      title: '丢包率(%)',
      dataIndex: 'packetLoss',
      key: 'packetLoss',
      width: 90,
      sorter: (a, b) => (a.packetLoss || 0) - (b.packetLoss || 0),
      render: (v) => v?.toFixed(2) || '-',
    },
    {
      title: '抖动(ms)',
      dataIndex: 'jitter',
      key: 'jitter',
      width: 90,
      render: (v) => v?.toFixed(1) || '-',
    },
    {
      title: '可用率',
      dataIndex: 'availability',
      key: 'availability',
      width: 100,
      render: (v) => v ? (v * 100).toFixed(1) + '%' : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(record)}>详情</Button>
          <Button size="small" danger onClick={() => handleReset(record.id)}>重置</Button>
        </Space>
      ),
    },
  ];

  const statusOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    legend: { data: ['正常', '告警', '严重'] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: latencyHistory.map(h => h.time) },
    yAxis: { type: 'value' },
    series: [
      { name: '正常', type: 'line', smooth: true, areaStyle: {}, data: latencyHistory.map(h => h.normal), itemStyle: { color: '#52c41a' } },
      { name: '告警', type: 'line', smooth: true, areaStyle: {}, data: latencyHistory.map(h => h.warning), itemStyle: { color: '#faad14' } },
      { name: '严重', type: 'line', smooth: true, areaStyle: {}, data: latencyHistory.map(h => h.critical), itemStyle: { color: '#ff4d4f' } },
    ],
  }), [latencyHistory]);

  const latencyHeatmapOption = useMemo(() => {
    const data = [];
    const hours = ['00', '04', '08', '12', '16', '20'];
    for (let i = 0; i < hours.length; i++) {
      for (let j = 0; j < 10; j++) {
        data.push([j, i, Math.floor(Math.random() * 100)]);
      }
    }
    return {
      tooltip: { position: 'top' },
      grid: { left: '15%', right: '10%', bottom: '15%', top: '10%' },
      xAxis: { type: 'category', data: Array.from({ length: 10 }, (_, i) => `L${i + 1}`), splitArea: { show: true } },
      yAxis: { type: 'category', data: hours, splitArea: { show: true } },
      visualMap: { min: 0, max: 100, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: ['#52c41a', '#faad14', '#ff4d4f'] } },
      series: [{ name: '延迟', type: 'heatmap', data, label: { show: false } }],
    };
  }, []);

  const summaryStats = useMemo(() => {
    const total = links.length;
    const normal = links.filter(l => l.status === 'NORMAL').length;
    const warning = links.filter(l => l.status === 'WARNING').length;
    const critical = links.filter(l => l.status === 'CRITICAL' || l.status === 'FATAL').length;
    return { total, normal, warning, critical };
  }, [links]);

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <DashboardOutlined style={{ fontSize: 28, color: '#1677ff' }} />
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1677ff', margin: '8px 0' }}>{summaryStats.total}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>总链路数</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <CheckCircleOutlined style={{ fontSize: 28, color: '#52c41a' }} />
            <div style={{ fontSize: 28, fontWeight: 700, color: '#52c41a', margin: '8px 0' }}>{summaryStats.normal}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>正常链路</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <WarningOutlined style={{ fontSize: 28, color: '#faad14' }} />
            <div style={{ fontSize: 28, fontWeight: 700, color: '#faad14', margin: '8px 0' }}>{summaryStats.warning}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>告警链路</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <LinkOutlined style={{ fontSize: 28, color: '#ff4d4f' }} />
            <div style={{ fontSize: 28, fontWeight: 700, color: '#ff4d4f', margin: '8px 0' }}>{summaryStats.critical}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>严重链路</div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="链路状态趋势">
            <ReactECharts option={statusOption} style={{ height: 260 }} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="链路延迟热力图">
            <ReactECharts option={latencyHeatmapOption} style={{ height: 260 }} />
          </Card>
        </Col>
      </Row>

      <Card
        title="链路详细列表"
        extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>}
        style={{ marginTop: 16 }}
      >
        <Table
          columns={columns}
          dataSource={links}
          rowKey="id"
          size="small"
          loading={loading}
          rowClassName={(record) => `link-row-${record.status?.toLowerCase()}`}
          pagination={{ pageSize: 10, size: 'small' }}
        />
      </Card>

      <Modal
        title="链路详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={700}
      >
        {selectedLink && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="链路ID">{selectedLink.id}</Descriptions.Item>
            <Descriptions.Item label="链路名称">{selectedLink.name}</Descriptions.Item>
            <Descriptions.Item label="类型">{LINK_TYPE_LABELS[selectedLink.type] || selectedLink.type}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={STATUS_COLORS[selectedLink.status] || 'default'}>{selectedLink.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="端点A">{selectedLink.endpointA}</Descriptions.Item>
            <Descriptions.Item label="端点B">{selectedLink.endpointB}</Descriptions.Item>
            <Descriptions.Item label="当前延迟">{selectedLink.latency?.toFixed(1)} ms</Descriptions.Item>
            <Descriptions.Item label="当前丢包">{selectedLink.packetLoss?.toFixed(2)} %</Descriptions.Item>
            <Descriptions.Item label="当前抖动">{selectedLink.jitter?.toFixed(1)} ms</Descriptions.Item>
            <Descriptions.Item label="可用率">{selectedLink.availability ? (selectedLink.availability * 100).toFixed(2) + '%' : '-'}</Descriptions.Item>
            <Descriptions.Item label="触发规则" span={2}>
              {selectedLink.violations?.length ? (
                <Space wrap>
                  {selectedLink.violations.map((v, i) => (
                    <Tag key={i} color="red">{v.ruleName}</Tag>
                  ))}
                </Space>
              ) : '无'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
