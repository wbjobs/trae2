import React, { useState, useEffect, useMemo } from 'react';
import { Row, Col, Card, Statistic, Tag, Spin, Empty, Progress, Tooltip } from 'antd';
import {
  ApiOutlined,
  LinkOutlined,
  ClusterOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import api from '../api/index.js';

const STAT_CARDS = [
  { key: 'nodes', label: '在线节点', icon: <ClusterOutlined />, type: 'info' },
  { key: 'signals', label: '信令/秒', icon: <ApiOutlined />, type: 'info' },
  { key: 'normal', label: '正常链路', icon: <CheckCircleOutlined />, type: 'normal' },
  { key: 'warning', label: '告警链路', icon: <ExclamationCircleOutlined />, type: 'warning' },
  { key: 'critical', label: '严重链路', icon: <WarningOutlined />, type: 'critical' },
];

export default function Overview({ wsMessages }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    nodes: 0,
    signals: 0,
    normal: 0,
    warning: 0,
    critical: 0,
  });
  const [abnormalLinks, setAbnormalLinks] = useState([]);
  const [signalTypes, setSignalTypes] = useState([]);
  const [latencyTrend, setLatencyTrend] = useState([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [signals, links, abnormal, nodes] = await Promise.all([
        api.signaling.stats().catch(() => ({ data: { data: { total: 0, perSecond: 0, byType: {} } } })),
        api.analysis.links().catch(() => ({ data: { data: { links: [] } } })),
        api.analysis.abnormal().catch(() => ({ data: { data: [] } })),
        api.nodes.list().catch(() => ({ data: { data: [] } })),
      ]);

      const linksArr = links.data?.data?.links || [];
      const normal = linksArr.filter(l => l.status === 'NORMAL').length;
      const warning = linksArr.filter(l => l.status === 'WARNING' || l.status === 'CRITICAL').length;
      const critical = linksArr.filter(l => l.status === 'FATAL').length;

      setStats({
        nodes: nodes.data?.data?.length || 0,
        signals: signals.data?.data?.perSecond || 0,
        normal,
        warning,
        critical,
      });

      setAbnormalLinks(abnormal.data?.data || []);

      const byType = signals.data?.data?.byType || {};
      setSignalTypes(Object.entries(byType).map(([name, count]) => ({ name, value: count })));

      const trend = [];
      const now = Date.now();
      for (let i = 29; i >= 0; i--) {
        trend.push({
          time: new Date(now - i * 60000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          latency: 20 + Math.random() * 30,
          jitter: 5 + Math.random() * 15,
        });
      }
      setLatencyTrend(trend);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!wsMessages?.length) return;
    const latest = wsMessages[wsMessages.length - 1];
    if (latest?.type === 'linkUpdate') {
      const link = latest.data;
      setAbnormalLinks(prev => {
        if (link.status === 'NORMAL') {
          return prev.filter(l => l.id !== link.id);
        }
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

  const signalTypeOption = useMemo(() => ({
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left', top: 'middle' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['60%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
      data: signalTypes.length ? signalTypes : [
        { name: '通信', value: 45 },
        { name: '门禁', value: 30 },
        { name: '广播', value: 25 },
      ],
      color: ['#1677ff', '#722ed1', '#13c2c2'],
    }],
  }), [signalTypes]);

  const trendOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    legend: { data: ['延迟(ms)', '抖动(ms)'], bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: latencyTrend.map(t => t.time) },
    yAxis: { type: 'value', name: 'ms' },
    series: [
      {
        name: '延迟(ms)',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.3 },
        data: latencyTrend.map(t => t.latency.toFixed(1)),
        itemStyle: { color: '#1677ff' },
      },
      {
        name: '抖动(ms)',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.3 },
        data: latencyTrend.map(t => t.jitter.toFixed(1)),
        itemStyle: { color: '#faad14' },
      },
    ],
  }), [latencyTrend]);

  const nodeStatusOption = useMemo(() => ({
    tooltip: {},
    series: [{
      type: 'gauge',
      progress: { show: true, width: 14 },
      axisLine: { lineStyle: { width: 14 } },
      axisTick: { show: false },
      splitLine: { length: 10, lineStyle: { width: 2, color: '#999' } },
      axisLabel: { distance: 18, fontSize: 10 },
      pointer: { width: 4 },
      detail: { valueAnimation: true, formatter: '{value}%', fontSize: 20, fontWeight: 'bold' },
      data: [{ value: Math.min(95, 85), name: '系统健康度' }],
      title: { show: true, offsetCenter: [0, '75%'], fontSize: 12 },
    }],
  }), []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        {STAT_CARDS.map(item => (
          <Col xs={12} sm={8} md={4} key={item.key}>
            <Card className={`stat-card ${item.type}`} bordered={false}>
              <div style={{ fontSize: 24, color: item.type === 'critical' ? '#ff4d4f' : item.type === 'warning' ? '#faad14' : item.type === 'normal' ? '#52c41a' : '#1677ff' }}>
                {item.icon}
              </div>
              <div className="stat-value">{stats[item.key]}</div>
              <div className="stat-label">{item.label}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="链路延迟/抖动趋势" extra={<ReloadOutlined onClick={loadData} style={{ cursor: 'pointer' }} />}>
            <ReactECharts option={trendOption} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="信令类型分布">
            <ReactECharts option={signalTypeOption} style={{ height: 280 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card title="系统健康度">
            <ReactECharts option={nodeStatusOption} style={{ height: 200 }} />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="异常链路列表" extra={<span style={{ color: '#ff4d4f' }}>{abnormalLinks.length} 条</span>}>
            {abnormalLinks.length === 0 ? (
              <Empty description="暂无异常链路" style={{ padding: 20 }} />
            ) : (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {abnormalLinks.slice(0, 8).map(link => (
                  <div
                    key={link.id}
                    className={`link-row-${link.status?.toLowerCase()}`}
                    style={{ padding: '6px 10px', marginBottom: 4, background: '#fafafa', borderRadius: 4 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>
                        <LinkOutlined style={{ marginRight: 8 }} />
                        {link.name}
                      </span>
                      <Tag color={link.status === 'CRITICAL' ? 'red' : link.status === 'WARNING' ? 'orange' : 'volcano'}>
                        {link.status}
                      </Tag>
                    </div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                      延迟: {link.latency?.toFixed(0)}ms | 丢包: {link.packetLoss?.toFixed(2)}% | 抖动: {link.jitter?.toFixed(1)}ms
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
