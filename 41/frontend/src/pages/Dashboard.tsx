import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, Tag } from 'antd';
import { ThunderboltOutlined, CheckCircleOutlined, WarningOutlined, BulbOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import axios from 'axios';

const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<any>({});
  const [devices, setDevices] = useState<any[]>([]);
  const [powerData, setPowerData] = useState<any[]>([]);

  useEffect(() => {
    fetchSummary();
    fetchDevices();
    const interval = setInterval(fetchSummary, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchSummary = async () => {
    try {
      const response = await axios.get('http://localhost:8000/summary');
      setSummary(response.data);
    } catch (error) {
      setSummary({
        total_power: 15.6,
        online_devices: 6,
        offline_devices: 1,
        alert_count: 2,
        today_energy: 124.8
      });
    }
  };

  const fetchDevices = async () => {
    try {
      const response = await axios.get('http://localhost:8000/devices?type=string');
      setDevices(response.data);
    } catch (error) {
      setDevices([
        { device_id: 'string-001', device_name: '组串S001', status: 'online', location: '1区-排1' },
        { device_id: 'string-002', device_name: '组串S002', status: 'online', location: '1区-排1' },
        { device_id: 'string-003', device_name: '组串S003', status: 'warning', location: '1区-排2' },
        { device_id: 'string-004', device_name: '组串S004', status: 'online', location: '2区-排1' },
      ]);
    }
  };

  const powerChartOption = {
    title: { text: '实时功率趋势', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: ['00:00', '04:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '24:00']
    },
    yAxis: { type: 'value', name: '功率 (kW)' },
    series: [{
      data: [0, 0.5, 5.2, 12.8, 18.5, 17.2, 12.1, 4.5, 0.2, 0],
      type: 'line',
      smooth: true,
      areaStyle: { color: 'rgba(82, 196, 26, 0.3)' },
      lineStyle: { color: '#52c41a' }
    }]
  };

  const columns = [
    { title: '设备ID', dataIndex: 'device_id', key: 'device_id' },
    { title: '设备名称', dataIndex: 'device_name', key: 'device_name' },
    { title: '位置', dataIndex: 'location', key: 'location' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const color = status === 'online' ? 'green' : status === 'warning' ? 'orange' : 'red';
        return <Tag color={color}>{status === 'online' ? '在线' : status === 'warning' ? '告警' : '离线'}</Tag>;
      }
    }
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="当前总功率"
              value={summary.total_power || 0}
              precision={2}
              suffix="kW"
              prefix={<ThunderboltOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日发电量"
              value={summary.today_energy || 0}
              precision={2}
              suffix="kWh"
              prefix={<BulbOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="在线设备"
              value={summary.online_devices || 0}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃告警"
              value={summary.alert_count || 0}
              prefix={<WarningOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={14}>
          <Card title="功率趋势" className="card-dashboard">
            <ReactECharts option={powerChartOption} style={{ height: 350 }} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="组串设备列表" className="card-dashboard">
            <Table
              columns={columns}
              dataSource={devices}
              pagination={false}
              size="small"
              rowKey="device_id"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
