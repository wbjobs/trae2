import React, { useState, useEffect, useMemo } from 'react';
import {
  Row, Col, Card, Select, Button, Space, Spin, message, Tabs,
  Radio, Divider, DatePicker, Checkbox, Switch, Tag, List
} from 'antd';
import { ReloadOutlined, DownloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { SoundingData, StationInfo } from '@/types';
import { soundingService } from '@/services/soundingService';
import { dataCleaner, dataFusion } from '@/modules/dataFusion';
import {
  TemperatureProfileChart,
  WindProfileChart,
  SkewTChart,
  RHProfileChart,
  WindBarbChart,
  VerticalCrossSection
} from '@/components/charts';
import { TemperatureProfileWithMarkers } from '@/components/charts/enhanced/TemperatureProfileWithMarkers';
import { useChangePoints } from '@/hooks/useSoundingData';
import { exportReport } from '@/modules/export';

const { Option } = Select;
const { TabPane } = Tabs;
const { RangePicker } = DatePicker;

const DataVisualization: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>('54398');
  const [soundingData, setSoundingData] = useState<SoundingData | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<SoundingData[]>([]);
  const [crossSectionField, setCrossSectionField] = useState<'temperature' | 'dewPoint' | 'relativeHumidity' | 'windSpeed'>('temperature');
  const [showMarkers, setShowMarkers] = useState(true);

  const changePoints = useChangePoints(soundingData?.dataPoints || []);

  useEffect(() => {
    loadStations();
    loadData('54398');
  }, []);

  const loadStations = async () => {
    try {
      const data = await soundingService.getStationList();
      setStations(data);
    } catch (error) {
      message.error('站点加载失败');
    }
  };

  const loadData = async (stationId: string) => {
    setLoading(true);
    try {
      const [latest, timeSeries] = await Promise.all([
        soundingService.getLatestSoundingData(stationId),
        soundingService.getSoundingDataRange(stationId, '', '')
      ]);

      const cleaned = dataCleaner.clean(latest.dataPoints);
      const fused = dataFusion.fuseToStandardLevels(cleaned.cleanedPoints);

      setSoundingData({ ...latest, dataPoints: fused });
      setTimeSeriesData(timeSeries.slice(0, 8));
    } catch (error) {
      message.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleStationChange = (stationId: string) => {
    setSelectedStation(stationId);
    loadData(stationId);
  };

  const handleExport = () => {
    if (!soundingData) return;
    exportReport({
      format: 'excel',
      soundingData,
      filename: `可视化数据_${soundingData.stationId}_${soundingData.soundingTime}`
    });
    message.success('导出成功');
  };

  if (loading) {
    return (
      <div className="loading-container">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <Card
        className="card-shadow"
        style={{ marginBottom: 16 }}
        title="可视化分析"
        extra={
          <Space>
            <Select
              value={selectedStation}
              onChange={handleStationChange}
              style={{ width: 200 }}
            >
              {stations.map(s => (
                <Option key={s.stationId} value={s.stationId}>
                  {s.stationName}
                </Option>
              ))}
            </Select>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadData(selectedStation)}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleExport}
            >
              导出数据
            </Button>
          </Space>
        }
      >
        {soundingData && (
        <Row gutter={16}>
          <Col span={6}>
            <div className="stat-card">
              <div className="stat-value">{soundingData.stationName}</div>
              <div className="stat-label">站点名称</div>
            </div>
          </Col>
          <Col span={6}>
            <div className="stat-card">
              <div className="stat-value">{soundingData.soundingTime}</div>
              <div className="stat-label">探空时间</div>
            </div>
          </Col>
          <Col span={6}>
            <div className="stat-card">
              <div className="stat-value">{soundingData.dataPoints.length}</div>
              <div className="stat-label">标准层数</div>
            </div>
          </Col>
          <Col span={6}>
            <div className="stat-card">
              <div className="stat-value">{soundingData.maxHeight} m</div>
              <div className="stat-label">最大高度</div>
            </div>
          </Col>
        </Row>
        )}
      </Card>

      {changePoints.summary && changePoints.summary.total > 0 && (
        <Card
          className="card-shadow"
          style={{ marginBottom: 16 }}
          title={
            <Space>
              <ThunderboltOutlined style={{ color: '#ff4d4f' }} />
              <span>突变点检测结果</span>
              <Tag color="red">检测到 {changePoints.summary.total} 个突变点</Tag>
            </Space>
          }
          extra={
            <Space>
              <span>显示突变点标记：</span>
              <Switch checked={showMarkers} onChange={setShowMarkers} />
            </Space>
          }
        >
          <Row gutter={[16, 8]}>
            {changePoints.byField.map(field => (
              <Col span={8} key={field.field}>
                <div style={{ padding: 8, background: '#f9f9f9', borderRadius: 4 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{field.fieldName}</div>
                  <div>
                    {field.points.slice(0, 3).map((point, idx) => (
                      <Tag key={idx} color={point.significance === 'high' ? 'red' : point.significance === 'medium' ? 'orange' : 'gold'}>
                        {point.height}m: {point.absoluteChange.toFixed(1)}{field.unit}
                      </Tag>
                    ))}
                    {field.points.length > 3 && (
                      <Tag color="default">+{field.points.length - 3}个</Tag>
                    )}
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      <Tabs defaultActiveKey="profile" size="large">
        <TabPane tab="廓线图" key="profile">
          {soundingData && (
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <div className="chart-container">
                  {showMarkers && changePoints.summary && changePoints.summary.total > 0 ? (
                    <TemperatureProfileWithMarkers
                      data={soundingData.dataPoints}
                      showMarkers={showMarkers}
                      height="450px"
                    />
                  ) : (
                    <TemperatureProfileChart data={soundingData.dataPoints} height="450px" />
                  )}
                </div>
              </Col>
              <Col span={12}>
                <div className="chart-container">
                  <WindProfileChart data={soundingData.dataPoints} height="450px" />
                </div>
              </Col>
              <Col span={12}>
                <div className="chart-container">
                  <RHProfileChart data={soundingData.dataPoints} height="450px" />
                </div>
              </Col>
              <Col span={12}>
                <div className="chart-container">
                  <SkewTChart data={soundingData.dataPoints} height="450px" />
                </div>
              </Col>
            </Row>
          )}
        </TabPane>

        <TabPane tab="风杆图" key="barb">
          {soundingData && (
            <div className="chart-container">
              <WindBarbChart data={soundingData.dataPoints} height="700px" />
            </div>
          )}
        </TabPane>

        <TabPane tab="垂直剖面图" key="cross-section">
          <Card className="card-shadow" style={{ marginBottom: 16 }}>
            <Space>
              <span>选择要素：</span>
              <Radio.Group
                value={crossSectionField}
                onChange={(e) => setCrossSectionField(e.target.value)}
              >
                <Radio.Button value="temperature">温度</Radio.Button>
                <Radio.Button value="dewPoint">露点</Radio.Button>
                <Radio.Button value="relativeHumidity">相对湿度</Radio.Button>
                <Radio.Button value="windSpeed">风速</Radio.Button>
              </Radio.Group>
            </Space>
          </Card>
          {timeSeriesData.length > 0 && (
            <div className="chart-container">
              <VerticalCrossSection
                data={timeSeriesData}
                field={crossSectionField}
                height="500px"
              />
            </div>
          )}
        </TabPane>

        <TabPane tab="多要素对比" key="comparison">
          <Card className="card-shadow">
            <MultiElementComparison data={soundingData} />
          </Card>
        </TabPane>
      </Tabs>
    </div>
  );
};

const MultiElementComparison: React.FC<{ data: SoundingData | null }> = ({ data }) => {
  const [selectedElements, setSelectedElements] = useState<string[]>(['temperature', 'dewPoint', 'relativeHumidity']);

  if (!data) return null;

  const elementOptions = [
    { key: 'temperature', name: '温度', color: '#ff4d4f', unit: '°C' },
    { key: 'dewPoint', name: '露点', color: '#1890ff', unit: '°C' },
    { key: 'relativeHumidity', name: '相对湿度', color: '#13c2c2', unit: '%' },
    { key: 'windSpeed', name: '风速', color: '#52c41a', unit: 'm/s' }
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
      <span>选择要素：</span>
      <Checkbox.Group
        value={selectedElements}
        onChange={(checked) => setSelectedElements(checked as string[])}
      >
        {elementOptions.map(opt => (
          <Checkbox key={opt.key} value={opt.key}>
            <span style={{ color: opt.color }}>●</span> {opt.name}
          </Checkbox>
        ))}
      </Checkbox.Group>
    </Space>

    <div className="chart-container">
      <MultiElementChart
        data={data.dataPoints}
        elements={selectedElements}
        elementOptions={elementOptions}
      />
    </div>
    </div>
  );
};

const MultiElementChart: React.FC<{
  data: any[];
  elements: string[];
  elementOptions: any[];
}> = ({ data, elements, elementOptions }) => {
  const ReactECharts = require('echarts-for-react').default;

  const heights = data.map(p => p.height);

  const series = elements.map(key => {
    const opt = elementOptions.find((o: any) => o.key === key);
    return {
      name: opt?.name,
      type: 'line',
      data: heights.map((h: number, i: number) => [data[i][key], h]),
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { color: opt?.color, width: 2 },
      itemStyle: { color: opt?.color }
    };
  });

  const option = {
    title: {
      text: '多要素廓线对比',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    legend: {
      data: elements.map(key => elementOptions.find((o: any) => o.name)),
      top: 30
    },
    grid: {
      left: '10%',
      right: '10%',
      bottom: '10%',
      top: '15%'
    },
    xAxis: {
      type: 'value',
      name: '数值'
    },
    yAxis: {
      type: 'value',
      name: '高度 (m)',
      min: 0,
      max: Math.max(...heights) * 1.1
    },
    series
  };

  return <ReactECharts option={option} style={{ height: '500px' }} />;
};

export default DataVisualization;
