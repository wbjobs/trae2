import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Select, DatePicker, Button, Table, Tag, Space } from 'antd';
import ReactECharts from 'echarts-for-react';
import axios from 'axios';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const DataAnalysis: React.FC = () => {
  const [selectedString, setSelectedString] = useState('string-001');
  const [dataList, setDataList] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [strings, setStrings] = useState<any[]>([]);

  useEffect(() => {
    fetchStrings();
    fetchAnalysis();
  }, []);

  useEffect(() => {
    if (selectedString) {
      fetchStringData();
    }
  }, [selectedString]);

  const fetchStrings = async () => {
    try {
      const response = await axios.get('http://localhost:8000/devices?type=string');
      setStrings(response.data);
    } catch (error) {
      setStrings([
        { device_id: 'string-001', device_name: '组串S001' },
        { device_id: 'string-002', device_name: '组串S002' },
        { device_id: 'string-003', device_name: '组串S003' },
        { device_id: 'string-004', device_name: '组串S004' },
      ]);
    }
  };

  const fetchAnalysis = async () => {
    try {
      const response = await axios.get(`http://localhost:8001/analyze/${selectedString}`);
      setAnalysis(response.data);
    } catch (error) {
      setAnalysis({
        latest_analysis: {
          voltage_normal: true,
          current_normal: true,
          temp_normal: true,
          overall_status: 'normal',
          efficiency: 0.85,
          recommendations: ['运行状态良好，继续保持日常巡检']
        },
        statistics: {
          avg_efficiency: 0.82,
          min_efficiency: 0.75,
          max_efficiency: 0.92
        }
      });
    }
  };

  const fetchStringData = async () => {
    try {
      const response = await axios.get(`http://localhost:8000/data/${selectedString}`, {
        params: { limit: 50 }
      });
      setDataList(response.data);
    } catch (error) {
      const mockData = [];
      for (let i = 0; i < 24; i++) {
        const hour = 6 + i;
        const voltage = 550 + Math.sin(i / 3) * 30 + Math.random() * 20;
        const current = 8 + Math.sin(i / 4) * 2 + Math.random();
        const temperature = 35 + Math.sin(i / 5) * 15 + Math.random() * 5;
        mockData.push({
          timestamp: dayjs().hour(hour).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss'),
          voltage,
          current,
          temperature,
          power: voltage * current
        });
      }
      setDataList(mockData);
    }
  };

  const voltageChartOption = {
    title: { text: '电压趋势', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: dataList.map(d => d.timestamp?.slice(11, 16) || ''),
      axisLabel: { rotate: 45 }
    },
    yAxis: { type: 'value', name: 'V' },
    series: [{
      name: '电压',
      data: dataList.map(d => d.voltage),
      type: 'line',
      smooth: true,
      lineStyle: { color: '#1890ff' }
    }]
  };

  const currentChartOption = {
    title: { text: '电流趋势', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: dataList.map(d => d.timestamp?.slice(11, 16) || ''),
      axisLabel: { rotate: 45 }
    },
    yAxis: { type: 'value', name: 'A' },
    series: [{
      name: '电流',
      data: dataList.map(d => d.current),
      type: 'line',
      smooth: true,
      lineStyle: { color: '#52c41a' }
    }]
  };

  const powerChartOption = {
    title: { text: '功率趋势', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: dataList.map(d => d.timestamp?.slice(11, 16) || ''),
      axisLabel: { rotate: 45 }
    },
    yAxis: { type: 'value', name: 'kW' },
    series: [{
      name: '功率',
      data: dataList.map(d => (d.power / 1000).toFixed(2)),
      type: 'bar',
      itemStyle: { color: '#faad14' }
    }]
  };

  const columns = [
    { title: '时间', dataIndex: 'timestamp', key: 'timestamp', render: (t: string) => t?.slice(11, 19) },
    { title: '电压(V)', dataIndex: 'voltage', key: 'voltage', render: (v: number) => v?.toFixed(2) },
    { title: '电流(A)', dataIndex: 'current', key: 'current', render: (v: number) => v?.toFixed(2) },
    { title: '温度(°C)', dataIndex: 'temperature', key: 'temperature', render: (v: number) => v?.toFixed(1) },
    { title: '功率(kW)', dataIndex: 'power', key: 'power', render: (v: number) => (v / 1000).toFixed(2) },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space size="large">
          <span>选择组串:</span>
          <Select
            style={{ width: 200 }}
            value={selectedString}
            onChange={setSelectedString}
          >
            {strings.map(s => (
              <Select.Option key={s.device_id} value={s.device_id}>
                {s.device_name}
              </Select.Option>
            ))}
          </Select>
          <RangePicker showTime />
          <Button type="primary" onClick={fetchStringData}>查询</Button>
          <Button onClick={fetchAnalysis}>分析</Button>
        </Space>
      </Card>

      {analysis && (
        <Card title="分析结果" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Card size="small">
                <div>
                  <div style={{ fontSize: 12, color: '#666' }}>整体状态</div>
                  <div style={{ fontSize: 24, fontWeight: 'bold', color: analysis.latest_analysis.overall_status === 'normal' ? '#52c41a' : '#faad14' }}>
                    {analysis.latest_analysis.overall_status === 'normal' ? '正常' : '异常'}
                  </div>
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <div>
                  <div style={{ fontSize: 12, color: '#666' }}>运行效率</div>
                  <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>
                    {(analysis.latest_analysis.efficiency * 100).toFixed(1)}%
                  </div>
                </div>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title="建议">
                <ul>
                  {analysis.latest_analysis.recommendations?.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </Card>
            </Col>
          </Row>
        </Card>
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card className="card-dashboard">
            <ReactECharts option={voltageChartOption} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card className="card-dashboard">
            <ReactECharts option={currentChartOption} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card className="card-dashboard">
            <ReactECharts option={powerChartOption} style={{ height: 280 }} />
          </Card>
        </Col>
      </Row>

      <Card title="历史数据" className="card-dashboard">
        <Table
          columns={columns}
          dataSource={dataList}
          pagination={{ pageSize: 10 }}
          size="small"
          rowKey="timestamp"
        />
      </Card>
    </div>
  );
};

export default DataAnalysis;
