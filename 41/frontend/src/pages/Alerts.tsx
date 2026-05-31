import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, Badge, Statistic, Row, Col } from 'antd';
import { CheckCircleOutlined, WarningOutlined, ExclamationCircleOutlined, BellOutlined } from '@ant-design/icons';
import axios from 'axios';

const Alerts: React.FC = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [acknowledged, setAcknowledged] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});

  useEffect(() => {
    fetchAlerts();
    const ws = new WebSocket('ws://localhost:8003/ws');
    ws.onmessage = (event) => {
      const alert = JSON.parse(event.data);
      setAlerts(prev => [alert, ...prev.filter(a => a.alert_id !== alert.alert_id)]);
    };
    return () => ws.close();
  }, []);

  const fetchAlerts = async () => {
    try {
      const response = await axios.get('http://localhost:8003/alerts?include_acknowledged=true');
      setAlerts(response.data.active || []);
      setAcknowledged(response.data.acknowledged || []);
    } catch (error) {
      setAlerts([
        { alert_id: 'alert-001', level: 'warning', device_id: 'string-003', device_name: '组串S003', message: '温度异常: 88°C', timestamp: new Date().toISOString() },
        { alert_id: 'alert-002', level: 'warning', device_id: 'string-003', device_name: '组串S003', message: '发电效率异常: 65%', timestamp: new Date().toISOString() },
      ]);
    }

    try {
      const response = await axios.get('http://localhost:8003/alerts/summary');
      setSummary(response.data);
    } catch (error) {
      setSummary({
        total_active: 2,
        by_level: { info: 0, warning: 2, error: 0, critical: 0 }
      });
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      await axios.post(`http://localhost:8003/alerts/${alertId}/acknowledge`);
      setAlerts(prev => prev.filter(a => a.alert_id !== alertId));
    } catch (error) {
      setAlerts(prev => prev.filter(a => a.alert_id !== alertId));
    }
  };

  const handleAcknowledgeAll = async () => {
    try {
      await axios.post('http://localhost:8003/alerts/acknowledge/all');
      setAlerts([]);
    } catch (error) {
      setAlerts([]);
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'info': return 'blue';
      case 'warning': return 'orange';
      case 'error': return 'red';
      case 'critical': return 'red';
      default: return 'default';
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'info': return <BellOutlined />;
      case 'warning': return <WarningOutlined />;
      case 'error': return <ExclamationCircleOutlined />;
      case 'critical': return <ExclamationCircleOutlined />;
      default: return null;
    }
  };

  const columns = [
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 100,
      render: (level: string) => (
        <Tag color={getLevelColor(level)} icon={getLevelIcon(level)}>
          {level.toUpperCase()}
        </Tag>
      )
    },
    { title: '设备', dataIndex: 'device_name', key: 'device_name' },
    { title: '消息', dataIndex: 'message', key: 'message' },
    { title: '时间', dataIndex: 'timestamp', key: 'timestamp', render: (t: string) => new Date(t).toLocaleString() },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Button type="link" onClick={() => handleAcknowledge(record.alert_id)}>
          确认
        </Button>
      )
    }
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃告警"
              value={summary.total_active || 0}
              prefix={<Badge status="processing" />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="警告"
              value={summary.by_level?.warning || 0}
              prefix={<WarningOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="错误"
              value={summary.by_level?.error || 0}
              prefix={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已确认"
              value={acknowledged.length}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="活跃告警"
        className="card-dashboard"
        extra={
          <Space>
            <Button onClick={fetchAlerts}>刷新</Button>
            <Button type="primary" danger onClick={handleAcknowledgeAll}>全部确认</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={alerts}
          pagination={false}
          rowKey="alert_id"
          locale={{ emptyText: '暂无告警' }}
        />
      </Card>

      <Card title="已确认告警" className="card-dashboard" style={{ marginTop: 16 }}>
        <Table
          columns={columns.slice(0, -1)}
          dataSource={acknowledged.slice(-20)}
          pagination={{ pageSize: 10 }}
          rowKey="alert_id"
          size="small"
        />
      </Card>
    </div>
  );
};

export default Alerts;
