import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Select, DatePicker, Statistic, Table, Tag, Space, Progress } from 'antd';
import { ThunderboltOutlined, LineChartOutlined, BulbOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import axios from 'axios';
import dayjs from 'dayjs';
import { useDataBuffer, useLatestData } from '../utils/dataManager';

const EnergyPrediction: React.FC = () => {
  const [selectedString, setSelectedString] = useState('string-001');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [strings, setStrings] = useState<any[]>([]);
  const [predictionDays, setPredictionDays] = useState(7);
  const [loading, setLoading] = useState(false);
  
  const latestData = useLatestData(selectedString);

  useEffect(() => {
    fetchStrings();
    fetchPredictions();
  }, []);

  useEffect(() => {
    if (selectedString) {
      fetchPredictions();
    }
  }, [selectedString, predictionDays]);

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

  const fetchPredictions = async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        `http://localhost:8001/predict/energy/${selectedString}`,
        null,
        { params: { days: predictionDays } }
      );
      setPredictions(response.data.predictions);
    } catch (error) {
      const mockPredictions = [];
      for (let i = 1; i <= predictionDays; i++) {
        const date = dayjs().add(i, 'day');
        const isWeekend = date.day() === 0 || date.day() === 6;
        const baseEnergy = isWeekend ? 25 : 30;
        mockPredictions.push({
          prediction_date: date.format('YYYY-MM-DD'),
          predicted_energy: baseEnergy + Math.random() * 10,
          confidence: 0.7 + Math.random() * 0.2,
          historical_avg: 28.5,
          trend_factor: 1.0 + (Math.random() - 0.5) * 0.2,
          weather_factor: 0.8 + Math.random() * 0.4,
          efficiency_factor: 0.9 + Math.random() * 0.2,
          hourly_predictions: generateHourlyPredictions(baseEnergy)
        });
      }
      setPredictions(mockPredictions);
    }
    setLoading(false);
  };

  const generateHourlyPredictions = (baseEnergy: number) => {
    const hourly = {};
    const curve = [
      0, 0, 0, 0, 0, 0.02, 0.05, 0.1, 0.2, 0.4, 0.6, 0.8,
      0.95, 1.0, 0.95, 0.8, 0.6, 0.4, 0.2, 0.1, 0.05, 0.02, 0, 0
    ];
    const total = curve.reduce((a, b) => a + b, 0);
    curve.forEach((factor, hour) => {
      hourly[`${hour.toString().padStart(2, '0')}:00`] = baseEnergy * factor / total;
    });
    return hourly;
  };

  const totalPredictedEnergy = predictions.reduce((sum, p) => sum + (p.predicted_energy || 0), 0);
  const avgConfidence = predictions.length > 0 
    ? predictions.reduce((sum, p) => sum + (p.confidence || 0), 0) / predictions.length 
    : 0;

  const predictionChartOption = {
    title: { text: '发电量预估趋势', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: predictions.map(p => p.prediction_date)
    },
    yAxis: { type: 'value', name: 'kWh' },
    series: [
      {
        name: '预估发电量',
        data: predictions.map(p => Math.round(p.predicted_energy * 100) / 100),
        type: 'bar',
        itemStyle: { color: '#52c41a' }
      },
      {
        name: '历史均值',
        data: predictions.map(p => Math.round(p.historical_avg * 100) / 100),
        type: 'line',
        smooth: true,
        lineStyle: { color: '#1890ff' },
        itemStyle: { color: '#1890ff' }
      }
    ],
    legend: { data: ['预估发电量', '历史均值'], bottom: 0 }
  };

  const confidenceChartOption = {
    title: { text: '预测置信度', left: 'center' },
    series: [{
      type: 'gauge',
      progress: { show: true, width: 18 },
      axisLine: { lineStyle: { width: 18 } },
      pointer: { show: true },
      min: 0,
      max: 1,
      splitNumber: 10,
      detail: {
        valueAnimation: true,
        formatter: (value: number) => `${(value * 100).toFixed(0)}%`,
        color: 'inherit',
        fontSize: 20
      },
      data: [{ value: avgConfidence }]
    }]
  };

  const columns = [
    { title: '日期', dataIndex: 'prediction_date', key: 'prediction_date' },
    {
      title: '预估发电量',
      dataIndex: 'predicted_energy',
      key: 'predicted_energy',
      render: (val: number) => `${val?.toFixed(2)} kWh`
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      key: 'confidence',
      render: (val: number) => (
        <Progress
          percent={Math.round((val || 0) * 100)}
          size="small"
          status={val > 0.8 ? 'success' : val > 0.6 ? 'normal' : 'exception'}
        />
      )
    },
    {
      title: '天气因子',
      dataIndex: 'weather_factor',
      key: 'weather_factor',
      render: (val: number) => (
        <Tag color={val > 1 ? 'green' : val > 0.8 ? 'blue' : 'orange'}>
          {val?.toFixed(2)}
        </Tag>
      )
    },
    {
      title: '效率因子',
      dataIndex: 'efficiency_factor',
      key: 'efficiency_factor',
      render: (val: number) => (
        <Tag color={val > 1 ? 'green' : val > 0.9 ? 'blue' : 'orange'}>
          {val?.toFixed(2)}
        </Tag>
      )
    }
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="未来预估总发电量"
              value={totalPredictedEnergy}
              precision={2}
              suffix="kWh"
              prefix={<BulbOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="平均预测置信度"
              value={avgConfidence * 100}
              precision={1}
              suffix="%"
              prefix={<LineChartOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="历史日均发电量"
              value={predictions[0]?.historical_avg || 0}
              precision={2}
              suffix="kWh"
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="预测天数"
              value={predictionDays}
              suffix="天"
            />
          </Card>
        </Col>
      </Row>

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
          <span>预测天数:</span>
          <Select
            style={{ width: 120 }}
            value={predictionDays}
            onChange={setPredictionDays}
          >
            <Select.Option value={3}>3天</Select.Option>
            <Select.Option value={7}>7天</Select.Option>
            <Select.Option value={14}>14天</Select.Option>
            <Select.Option value={30}>30天</Select.Option>
          </Select>
        </Space>
      </Card>

      <Row gutter={16}>
        <Col span={16}>
          <Card title="发电量预估趋势" loading={loading}>
            <ReactECharts option={predictionChartOption} style={{ height: 350 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="预测置信度" loading={loading}>
            <ReactECharts option={confidenceChartOption} style={{ height: 350 }} />
          </Card>
        </Col>
      </Row>

      <Card title="每日预测详情" style={{ marginTop: 16 }} loading={loading}>
        <Table
          columns={columns}
          dataSource={predictions}
          pagination={false}
          rowKey="prediction_date"
        />
      </Card>

      {latestData && (
        <Card title="当前实时数据" style={{ marginTop: 16 }} type="inner">
          <Row gutter={16}>
            <Col span={6}>
              <Statistic title="电压" value={latestData.voltage} suffix="V" precision={2} />
            </Col>
            <Col span={6}>
              <Statistic title="电流" value={latestData.current} suffix="A" precision={2} />
            </Col>
            <Col span={6}>
              <Statistic title="温度" value={latestData.temperature} suffix="°C" precision={1} />
            </Col>
            <Col span={6}>
              <Statistic title="功率" value={(latestData.power || 0) / 1000} suffix="kW" precision={3} />
            </Col>
          </Row>
        </Card>
      )}
    </div>
  );
};

export default EnergyPrediction;
