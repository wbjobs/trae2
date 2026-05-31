import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Button,
  Slider,
  Select,
  DatePicker,
  Table,
  Space,
  Tag,
  Progress,
  Empty,
  Alert,
  Row,
  Col,
  Statistic,
  Tooltip,
  Modal,
  message,
} from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  DownloadOutlined,
  FastForwardOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import api from '../api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;

const EVENT_TYPE_COLORS = {
  fault_occurred: 'red',
  fault_recovered: 'green',
  severity_upgrade: 'orange',
  severity_downgrade: 'blue',
  fluctuation: 'purple',
};

const EVENT_TYPE_LABELS = {
  fault_occurred: '故障发生',
  fault_recovered: '故障恢复',
  severity_upgrade: '严重度升级',
  severity_downgrade: '严重度降级',
  fluctuation: '状态波动',
};

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4, 8, 16];

const FaultReplay = ({ linkId, linkName }) => {
  const [events, setEvents] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [replaySession, setReplaySession] = useState(null);
  const [replayStatus, setReplayStatus] = useState(null);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeRange, setTimeRange] = useState([dayjs().subtract(7, 'day'), dayjs()]);
  const [eventTypeFilter, setEventTypeFilter] = useState();
  const [exportModal, setExportModal] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState(null);

  const wsRef = useRef(null);
  const statusTimerRef = useRef(null);

  const fetchFaultEvents = async () => {
    setLoading(true);
    try {
      const params = {
        startTime: timeRange[0].toISOString(),
        endTime: timeRange[1].toISOString(),
      };
      if (linkId) params.linkId = linkId;
      if (eventTypeFilter) params.eventType = eventTypeFilter;

      const res = await api.analysis.faultEvents(params);
      setEvents(res.data?.data || []);
    } catch (err) {
      message.error('获取故障事件失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeline = async () => {
    try {
      const params = {
        startTime: timeRange[0].toISOString(),
        endTime: timeRange[1].toISOString(),
      };
      if (linkId) params.linkId = linkId;

      const res = await api.analysis.faultTimeline(params);
      setTimeline(res.data?.data || []);
    } catch (err) {
      console.error('获取时间轴失败', err);
    }
  };

  const fetchStats = async () => {
    if (!linkId) return;
    try {
      const res = await api.analysis.faultDuration(linkId);
      setStats(res.data?.data);
    } catch (err) {
      console.error('获取统计信息失败', err);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await api.analysis.replaySessions();
      setSessions(res.data?.data || []);
    } catch (err) {
      console.error('获取回放会话失败', err);
    }
  };

  useEffect(() => {
    fetchFaultEvents();
    fetchTimeline();
    fetchStats();
    fetchSessions();
  }, [timeRange, eventTypeFilter, linkId]);

  useEffect(() => {
    if (replaySession) {
      statusTimerRef.current = setInterval(async () => {
        try {
          const res = await api.analysis.replayStatus(replaySession.sessionId);
          setReplayStatus(res.data?.data);
          if (res.data?.data?.currentEvent) {
            const idx = events.findIndex(e => e.id === res.data.data.currentEvent.id);
            if (idx >= 0) setCurrentIndex(idx);
          }
          if (res.data?.data?.status === 'completed') {
            clearInterval(statusTimerRef.current);
            message.success('回放完成');
          }
        } catch (err) {
          console.error('获取回放状态失败', err);
        }
      }, 500);
    }

    return () => {
      if (statusTimerRef.current) clearInterval(statusTimerRef.current);
    };
  }, [replaySession, events]);

  const handleCreateReplay = async () => {
    if (events.length === 0) {
      message.warning('没有可回放的故障事件');
      return;
    }
    try {
      const res = await api.analysis.createReplay({
        linkId,
        startTime: timeRange[0].toISOString(),
        endTime: timeRange[1].toISOString(),
        speed: playSpeed,
        loop: false,
      });
      setReplaySession(res.data?.data);
      message.success('回放会话已创建');
      fetchSessions();
    } catch (err) {
      message.error('创建回放会话失败');
    }
  };

  const handleReplayControl = async (action, data = {}) => {
    if (!replaySession) return;
    try {
      await api.analysis.replayControl(replaySession.sessionId, action, data);
      if (action === 'start') message.success('开始回放');
      if (action === 'pause') message.info('已暂停');
      if (action === 'resume') message.info('继续回放');
      if (action === 'stop') {
        setReplaySession(null);
        setReplayStatus(null);
        setCurrentIndex(0);
        message.info('已停止回放');
      }
    } catch (err) {
      message.error('操作失败');
    }
  };

  const handleSeek = async (index) => {
    if (!replaySession || events.length === 0) return;
    const event = events[index];
    if (!event) return;
    try {
      await api.analysis.replayControl(replaySession.sessionId, 'seek', {
        timestamp: event.timestamp,
      });
      setCurrentIndex(index);
    } catch (err) {
      message.error('跳转失败');
    }
  };

  const handleSpeedChange = async (speed) => {
    setPlaySpeed(speed);
    if (replaySession) {
      try {
        await api.analysis.replayControl(replaySession.sessionId, 'speed', { speed });
      } catch (err) {
        message.error('设置速度失败');
      }
    }
  };

  const handleExport = async (format) => {
    try {
      const params = {
        startTime: timeRange[0].toISOString(),
        endTime: timeRange[1].toISOString(),
        format,
      };
      if (linkId) params.linkId = linkId;

      const res = await api.analysis.faultExport(params);
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fault-events-${dayjs().format('YYYYMMDD-HHmmss')}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setExportModal(false);
      message.success('导出成功');
    } catch (err) {
      message.error('导出失败');
    }
  };

  const columns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '事件类型',
      dataIndex: 'eventType',
      key: 'eventType',
      width: 120,
      render: (type) => (
        <Tag color={EVENT_TYPE_COLORS[type]}>
          {EVENT_TYPE_LABELS[type] || type}
        </Tag>
      ),
    },
    {
      title: '链路',
      dataIndex: 'linkName',
      key: 'linkName',
      width: 150,
      render: (name) => name || linkName || '-',
    },
    {
      title: '严重度',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (s) => {
        const colors = { fatal: 'red', critical: 'orange', warning: 'gold', info: 'blue' };
        return <Tag color={colors[s]}>{s?.toUpperCase()}</Tag>;
      },
    },
    {
      title: '详情',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record, index) => (
        <Button size="small" onClick={() => handleSeek(index)} disabled={!replaySession}>
          跳转
        </Button>
      ),
    },
  ];

  const progress = events.length > 0 ? ((currentIndex + 1) / events.length) * 100 : 0;

  return (
    <div>
      {linkName && (
        <Alert
          message={`链路回放: ${linkName}`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card>
              <Statistic title="故障总次数" value={stats.totalFaults} valueStyle={{ color: '#ff4d4f' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="平均持续时间" value={stats.avgDuration} suffix="秒" />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="最长持续时间" value={stats.maxDuration} suffix="秒" />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="总停机时间" value={stats.totalDowntime} suffix="秒" />
            </Card>
          </Col>
        </Row>
      )}

      <Card
        title={
          <Space>
            <HistoryOutlined />
            故障时序回放
          </Space>
        }
        extra={
          <Space>
            <RangePicker
              showTime
              value={timeRange}
              onChange={setTimeRange}
              style={{ width: 380 }}
            />
            <Select
              placeholder="事件类型"
              style={{ width: 140 }}
              allowClear
              value={eventTypeFilter}
              onChange={setEventTypeFilter}
            >
              {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                <Option key={key} value={key}>{label}</Option>
              ))}
            </Select>
            <Button icon={<DownloadOutlined />} onClick={() => setExportModal(true)}>
              导出
            </Button>
            <Button onClick={fetchSessions} disabled>
              历史会话
            </Button>
          </Space>
        }
      >
        <Card
          size="small"
          style={{ marginBottom: 16, background: '#fafafa' }}
          extra={
            <Space>
              <span>速度:</span>
              <Select
                value={playSpeed}
                onChange={handleSpeedChange}
                style={{ width: 90 }}
                size="small"
              >
                {SPEED_OPTIONS.map(s => (
                  <Option key={s} value={s}>{s}x</Option>
                ))}
              </Select>
            </Space>
          }
        >
          <Space style={{ marginBottom: 12 }}>
            <Tooltip title="创建回放">
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleCreateReplay}
                disabled={replaySession?.status === 'playing' || events.length === 0}
              >
                创建回放
              </Button>
            </Tooltip>
            <Tooltip title="播放">
              <Button
                icon={<PlayCircleOutlined />}
                onClick={() => handleReplayControl('start')}
                disabled={!replaySession || replayStatus?.status === 'playing'}
              />
            </Tooltip>
            <Tooltip title="暂停">
              <Button
                icon={<PauseCircleOutlined />}
                onClick={() => handleReplayControl('pause')}
                disabled={!replaySession || replayStatus?.status !== 'playing'}
              />
            </Tooltip>
            <Tooltip title="继续">
              <Button
                icon={<StepForwardOutlined />}
                onClick={() => handleReplayControl('resume')}
                disabled={!replaySession || replayStatus?.status === 'playing'}
              />
            </Tooltip>
            <Tooltip title="上一帧">
              <Button
                icon={<StepBackwardOutlined />}
                onClick={() => handleSeek(Math.max(0, currentIndex - 1))}
                disabled={!replaySession}
              />
            </Tooltip>
            <Tooltip title="下一帧">
              <Button
                icon={<StepForwardOutlined />}
                onClick={() => handleSeek(Math.min(events.length - 1, currentIndex + 1))}
                disabled={!replaySession}
              />
            </Tooltip>
            <Tooltip title="停止">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => handleReplayControl('stop')}
                disabled={!replaySession}
                danger
              />
            </Tooltip>
            {replaySession && (
              <Tag color="blue">
                会话: {replaySession.sessionId.slice(0, 8)}
              </Tag>
            )}
            {replayStatus && (
              <Tag color={replayStatus.status === 'playing' ? 'green' : 'orange'}>
                {replayStatus.status === 'playing' ? '播放中' :
                 replayStatus.status === 'paused' ? '已暂停' :
                 replayStatus.status === 'completed' ? '已完成' : '就绪'}
              </Tag>
            )}
          </Space>

          {replaySession && (
            <>
              <Progress
                percent={Math.round(progress)}
                showInfo
                format={() => `${currentIndex + 1} / ${events.length}`}
              />
              <Slider
                min={0}
                max={events.length - 1}
                value={currentIndex}
                onChange={handleSeek}
                tooltip={{
                  formatter: (val) => events[val] ? dayjs(events[val].timestamp).format('HH:mm:ss') : '',
                }}
                marks={
                  events.length > 0 ? {
                    0: dayjs(events[0].timestamp).format('HH:mm'),
                    [events.length - 1]: dayjs(events[events.length - 1].timestamp).format('HH:mm'),
                  } : {}
                }
              />
            </>
          )}

          {replayStatus?.currentEvent && (
            <Alert
              style={{ marginTop: 12 }}
              message={
                <Space>
                  <Tag color={EVENT_TYPE_COLORS[replayStatus.currentEvent.eventType]}>
                    {EVENT_TYPE_LABELS[replayStatus.currentEvent.eventType]}
                  </Tag>
                  <span>{replayStatus.currentEvent.description}</span>
                </Space>
              }
              type={replayStatus.currentEvent.eventType === 'fault_occurred' ? 'error' :
                    replayStatus.currentEvent.eventType === 'fault_recovered' ? 'success' : 'warning'}
              showIcon
            />
          )}
        </Card>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={events}
          loading={loading}
          size="small"
          pagination={{ pageSize: 10 }}
          scroll={{ y: 300 }}
          rowClassName={(_, index) => index === currentIndex && replaySession ? 'ant-table-row-selected' : ''}
          onRow={(record, index) => ({
            onClick: () => {
              if (replaySession) handleSeek(index);
            },
            style: { cursor: replaySession ? 'pointer' : 'default' },
          })}
          locale={{ emptyText: <Empty description="暂无故障事件" /> }}
        />
      </Card>

      <Modal
        title="导出故障事件"
        open={exportModal}
        onCancel={() => setExportModal(false)}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button block icon={<DownloadOutlined />} onClick={() => handleExport('json')}>
            导出为 JSON 格式
          </Button>
          <Button block icon={<DownloadOutlined />} onClick={() => handleExport('csv')}>
            导出为 CSV 格式
          </Button>
        </Space>
      </Modal>
    </div>
  );
};

export default FaultReplay;
