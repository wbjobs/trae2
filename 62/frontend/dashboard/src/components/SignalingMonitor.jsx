import React, { useState, useEffect, useMemo } from 'react';
import { Row, Col, Card, Table, Tag, Button, Modal, Descriptions, Progress, Statistic, Space, message, Spin } from 'antd';
import { ApiOutlined, CheckCircleOutlined, SyncOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import api from '../api/index.js';

const SIGNAL_TYPE_COLORS = {
  communication: 'blue',
  access: 'purple',
  broadcast: 'cyan',
  pa_system: 'geekblue',
  cctv: 'magenta',
  passenger_info: 'volcano',
};

const PRIORITY_COLORS = {
  CRITICAL: 'red',
  HIGH: 'orange',
  NORMAL: 'blue',
  LOW: 'default',
};

export default function SignalingMonitor({ wsMessages }) {
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState([]);
  const [snifferStats, setSnifferStats] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        api.signaling.list({ limit: 50, offset: 0 }).catch(() => ({ data: { data: [] } })),
        api.signaling.snifferStats().catch(() => ({ data: { data: null } })),
      ]);
      setSignals(listRes.data?.data || []);
      setSnifferStats(statsRes.data?.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!wsMessages?.length) return;
    const latest = wsMessages[wsMessages.length - 1];
    if (latest?.type === 'newSignals') {
      const newSignals = latest.data?.signals || [];
      if (newSignals.length) {
        setSignals(prev => [...newSignals.reverse(), ...prev].slice(0, 50));
      }
    }
  }, [wsMessages]);

  const handleAck = async (id) => {
    try {
      await api.signaling.ack(id);
      message.success('已确认接收');
      loadData();
    } catch (err) {
      message.error('确认失败: ' + err.message);
    }
  };

  const columns = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (t) => <Tag color={SIGNAL_TYPE_COLORS[t] || 'default'}>{t}</Tag>,
    },
    {
      title: '子类型',
      dataIndex: 'subType',
      key: 'subType',
      width: 100,
    },
    {
      title: '源',
      dataIndex: 'source',
      key: 'source',
      width: 140,
    },
    {
      title: '目的',
      dataIndex: 'destination',
      key: 'destination',
      width: 140,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (p) => <Tag color={PRIORITY_COLORS[p] || 'default'}>{p}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (s) => {
        if (s === 'acked') return <Tag color="green">已确认</Tag>;
        if (s === 'retransmitted') return <Tag color="orange">重传中</Tag>;
        if (s === 'lost') return <Tag color="red">已丢失</Tag>;
        return <Tag color="blue">待确认</Tag>;
      },
    },
    {
      title: '时间',
      dataIndex: 'receivedAt',
      key: 'receivedAt',
      width: 160,
      render: (t) => t ? new Date(t).toLocaleTimeString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelectedSignal(record); setDetailVisible(true); }}>
            详情
          </Button>
          {record.status === 'pending' && (
            <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => handleAck(record.id)}>
              确认
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const priorityOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    legend: { data: ['关键', '高', '普通', '低'] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: Array.from({ length: 10 }, (_, i) => `${i * 3}s`) },
    yAxis: { type: 'value' },
    series: [
      { name: '关键', type: 'line', stack: 'total', areaStyle: {}, data: Array.from({ length: 10 }, () => Math.floor(Math.random() * 5 + 1)) },
      { name: '高', type: 'line', stack: 'total', areaStyle: {}, data: Array.from({ length: 10 }, () => Math.floor(Math.random() * 10 + 5)) },
      { name: '普通', type: 'line', stack: 'total', areaStyle: {}, data: Array.from({ length: 10 }, () => Math.floor(Math.random() * 20 + 10)) },
      { name: '低', type: 'line', stack: 'total', areaStyle: {}, data: Array.from({ length: 10 }, () => Math.floor(Math.random() * 15 + 5)) },
    ],
  }), []);

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <Statistic title="缓冲区占用" value={snifferStats?.bufferSize || 0} suffix={`/ ${snifferStats?.maxBufferSize || 2000}`} valueStyle={{ color: '#1677ff' }} />
            <Progress percent={Math.min(100, Math.round((snifferStats?.bufferSize || 0) / (snifferStats?.maxBufferSize || 2000) * 100))} showInfo={false} style={{ marginTop: 8 }} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <Statistic title="队列积压" value={snifferStats?.queueDepth || 0} valueStyle={{ color: snifferStats?.queueDepth > 100 ? '#ff4d4f' : '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <Statistic title="重传中" value={snifferStats?.retransmissionCount || 0} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <Statistic title="ACK 确认率" value={snifferStats?.ackRate ? (snifferStats.ackRate * 100).toFixed(1) : 0} suffix="%" valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card title="优先级队列分布">
            <ReactECharts option={priorityOption} style={{ height: 250 }} />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card
            title="信令列表"
            extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>}
          >
            <Table
              columns={columns}
              dataSource={signals}
              rowKey="id"
              size="small"
              loading={loading}
              pagination={{ pageSize: 8, size: 'small' }}
              scroll={{ y: 300 }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title="信令详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={600}
      >
        {selectedSignal && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="ID">{selectedSignal.id}</Descriptions.Item>
            <Descriptions.Item label="类型">{selectedSignal.type}</Descriptions.Item>
            <Descriptions.Item label="子类型">{selectedSignal.subType}</Descriptions.Item>
            <Descriptions.Item label="优先级">{selectedSignal.priority}</Descriptions.Item>
            <Descriptions.Item label="源">{selectedSignal.source}</Descriptions.Item>
            <Descriptions.Item label="目的">{selectedSignal.destination}</Descriptions.Item>
            <Descriptions.Item label="状态">{selectedSignal.status}</Descriptions.Item>
            <Descriptions.Item label="协议">{selectedSignal.protocol}</Descriptions.Item>
            <Descriptions.Item label="长度">{selectedSignal.length} bytes</Descriptions.Item>
            <Descriptions.Item label="接收时间">{selectedSignal.receivedAt ? new Date(selectedSignal.receivedAt).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
            <Descriptions.Item label="原始数据" span={2}>
              <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{selectedSignal.rawData || '-'}</code>
            </Descriptions.Item>
            <Descriptions.Item label="解析结果" span={2}>
              <code style={{ fontSize: 11, wordBreak: 'break-all' }}>
                {selectedSignal.parsed ? JSON.stringify(selectedSignal.parsed, null, 2) : '-'}
              </code>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
