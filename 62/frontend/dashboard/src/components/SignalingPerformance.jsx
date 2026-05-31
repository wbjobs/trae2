import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Tag,
  Alert,
  Space,
  Table,
  Button,
  Empty,
  Tooltip,
  Badge,
} from 'antd';
import {
  DashboardOutlined,
  ThunderboltOutlined,
  DownCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import api from '../api';
import dayjs from 'dayjs';

const SignalingPerformance = () => {
  const [stats, setStats] = useState(null);
  const [cpuChartData, setCpuChartData] = useState([]);
  const [throughputData, setThroughputData] = useState([]);
  const [loading, setLoading] = useState(false);

  const prevCountRef = useRef(0);
  const prevTimeRef = useRef(Date.now());

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await api.signaling.snifferStats();
      const data = res.data?.data;
      setStats(data);

      const now = Date.now();
      const timeDiff = (now - prevTimeRef.current) / 1000;

      if (prevCountRef.current > 0 && timeDiff > 0) {
        const throughput = (data.signalCount - prevCountRef.current) / timeDiff;
        setThroughputData(prev => {
          const newData = [...prev, { time: dayjs().format('HH:mm:ss'), value: Math.round(throughput) }];
          return newData.slice(-30);
        });

        setCpuChartData(prev => {
          const newData = [...prev, { time: dayjs().format('HH:mm:ss'), cpu: data.systemLoad?.cpu || 0, queue: data.queueSize || 0 }];
          return newData.slice(-30);
        });
      }

      prevCountRef.current = data.signalCount;
      prevTimeRef.current = now;
    } catch (err) {
      console.error('获取性能统计失败', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const timer = setInterval(fetchStats, 3000);
    return () => clearInterval(timer);
  }, []);

  const cpuChartOption = {
    title: { text: '系统负载趋势', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    legend: { data: ['CPU使用率', '队列大小'], bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%' },
    xAxis: { type: 'category', data: cpuChartData.map(d => d.time), axisLabel: { fontSize: 10 } },
    yAxis: [
      { type: 'value', name: 'CPU %', max: 100, axisLabel: { fontSize: 10 } },
      { type: 'value', name: '队列', axisLabel: { fontSize: 10 } },
    ],
    series: [
      {
        name: 'CPU使用率',
        type: 'line',
        data: cpuChartData.map(d => d.cpu),
        smooth: true,
        lineStyle: { color: '#ff4d4f' },
        areaStyle: { opacity: 0.3, color: '#ff4d4f' },
      },
      {
        name: '队列大小',
        type: 'line',
        yAxisIndex: 1,
        data: cpuChartData.map(d => d.queue),
        smooth: true,
        lineStyle: { color: '#1890ff' },
        areaStyle: { opacity: 0.3, color: '#1890ff' },
      },
    ],
  };

  const throughputChartOption = {
    title: { text: '信令吞吐率 (条/秒', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '10%', top: '15%' },
    xAxis: { type: 'category', data: throughputData.map(d => d.time), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
    series: [{
      name: '吞吐率',
      type: 'line',
      data: throughputData.map(d => d.value),
      smooth: true,
      lineStyle: { color: '#52c41a' },
      areaStyle: { opacity: 0.3, color: '#52c41a' },
    }],
  };

  const loadLevelConfig = {
    normal: { color: '#52c41a', text: '正常' },
    high: { color: '#faad14', text: '较高' },
    critical: { color: '#ff4d4f', text: '过载' },
  };

  if (!stats) return <Empty description="加载中..." />;

  const loadLevel = loadLevelConfig[stats.systemLoad?.level || 'normal'];

  const columns = [
    {
      title: '指标',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (text, record) => (
        <Space>
          {record.icon}
          <span style={{ fontWeight: 500 }}>{text}</span>
        </Space>
      ),
    },
    {
      title: '数值',
      dataIndex: 'value',
      key: 'value',
      render: (text, record) => {
        if (record.suffix) return `${text.toLocaleString()} ${record.suffix}`;
        if (record.percent) return <Progress percent={text} size="small" />;
        return text?.toLocaleString() || '-';
      },
    },
  ];

  const performanceData = [
    { name: '总信令数', value: stats.signalCount, icon: <DashboardOutlined /> },
    { name: '已确认数', value: stats.ackedCount, icon: <CheckCircleOutlined /> },
    { name: '重传次数', value: stats.retryCount, icon: <ReloadOutlined /> },
    { name: '丢弃数', value: stats.droppedCount, icon: <DownCircleOutlined /> },
    { name: '采样丢弃', value: stats.sampledCount, icon: <WarningOutlined /> },
    { name: '批量插入次数', value: stats.batchInsertCount, icon: <ThunderboltOutlined /> },
    { name: '队列大小', value: stats.queueSize, icon: <ClockCircleOutlined /> },
    { name: '处理缓冲', value: stats.bufferSize, icon: <ClockCircleOutlined /> },
    { name: 'DB写入缓冲', value: stats.dbBufferSize, icon: <ClockCircleOutlined /> },
  ];

  return (
    <div>
      <Alert
      message={
        <Space>
          <Badge color={loadLevel.color} />
          <span>系统负载状态: {loadLevel.text}</span>
          {stats.degradationLevel > 0 && (
            <Tag color="orange">降级级别: {stats.degradationLevel}</Tag>
          )}
          <Tag color="blue">捕获间隔: {stats.captureInterval}ms</Tag>
        </Space>
      }
      type={stats.systemLoad?.level === 'critical' ? 'error' : stats.systemLoad?.level === 'high' ? 'warning' : 'success'}
      showIcon
      style={{ marginBottom: 16 }}
    />

    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      <Col span={6}>
        <Card size="small">
          <Statistic
            title={<Space><ThunderboltOutlined style={{ color: '#1890ff' }} /> 处理速率</Space>}
            value={throughputData.length > 0 ? throughputData[throughputData.length - 1]?.value || 0 : 0}
            suffix="条/秒"
            valueStyle={{ color: '#1890ff' }}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card size="small">
          <Statistic
            title={<Space><DashboardOutlined style={{ color: '#722ed1' }} /> CPU使用率</Space>}
            value={stats.systemLoad?.cpu || 0}
            suffix="%"
            valueStyle={{ color: stats.systemLoad?.cpu > 70 ? '#ff4d4f' : '#722ed1' }}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card size="small">
          <Statistic
            title={<Space><WarningOutlined style={{ color: '#fa8c16' }} /> 内存使用率</Space>}
            value={stats.systemLoad?.memory || 0}
            suffix="%"
            valueStyle={{ color: stats.systemLoad?.memory > 80 ? '#ff4d4f' : '#fa8c16' }}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card size="small">
          <Statistic
            title={<Space><ClockCircleOutlined style={{ color: '#52c41a' }} /> 队列大小</Space>}
            value={stats.queueSize || 0}
            valueStyle={{ color: stats.queueSize > 500 ? '#ff4d4f' : '#52c41a' }}
          />
        </Card>
      </Col>
    </Row>

    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      <Col span={12}>
        <Card size="small" title="系统负载监控" loading={loading}>
          <ReactECharts option={cpuChartOption} style={{ height: 280 }} notMerge={true} />
        </Card>
      </Col>
      <Col span={12}>
        <Card size="small" title="吞吐率监控" loading={loading}>
          <ReactECharts option={throughputChartOption} style={{ height: 280 }} notMerge={true} />
        </Card>
      </Col>
    </Row>

    <Card size="small" title="性能指标详情" extra={<Button size="small" onClick={fetchStats} loading={loading}>刷新</Button>}>
      <Table
        rowKey="name"
        columns={columns}
        dataSource={performanceData}
        size="small"
        pagination={false}
        showHeader={false}
      />
    </Card>

    {stats.performanceConfig && (
      <Card size="small" title="性能配置" style={{ marginTop: 16 }}>
        <Row gutter={[16, 8]}>
          <Col span={8}>
          <Tooltip title="基础捕获间隔">
            <Tag color="blue">基础间隔: {stats.performanceConfig.BASE_CAPTURE_INTERVAL}ms</Tag>
          </Tooltip>
          </Col>
          <Col span={8}>
          <Tooltip title="最小捕获间隔">
            <Tag color="green">最小间隔: {stats.performanceConfig.MIN_CAPTURE_INTERVAL}ms</Tag>
          </Tooltip>
          </Col>
          <Col span={8}>
          <Tooltip title="最大捕获间隔">
            <Tag color="orange">最大间隔: {stats.performanceConfig.MAX_CAPTURE_INTERVAL}ms</Tag>
          </Tooltip>
          </Col>
          <Col span={8}>
          <Tooltip title="队列高阈值">
            <Tag color="gold">队列高阈值: {stats.performanceConfig.QUEUE_HIGH_THRESHOLD}</Tag>
          </Tooltip>
          </Col>
          <Col span={8}>
          <Tooltip title="队列临界阈值">
            <Tag color="red">队列临界阈值: {stats.performanceConfig.QUEUE_CRITICAL_THRESHOLD}</Tag>
          </Tooltip>
          </Col>
          <Col span={8}>
          <Tooltip title="CPU高阈值">
            <Tag color="purple">CPU高阈值: {stats.performanceConfig.CPU_HIGH_THRESHOLD}%</Tag>
          </Tooltip>
          </Col>
        </Row>
      </Card>
    )}
  </div>
  );
};

export default SignalingPerformance;
