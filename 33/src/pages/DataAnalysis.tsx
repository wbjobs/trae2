import React, { useState, useEffect } from 'react';
import {
  Row, Col, Card, Select, Button, Space, Spin, message, Tabs,
  Table, Tag, Radio, Dropdown, MenuProps
} from 'antd';
import {
  DownloadOutlined, ReloadOutlined, ThunderboltOutlined,
  WindOutlined, ThermometerOutlined
} from '@ant-design/icons';
import { SoundingData, StationInfo, MeteorologicalIndex } from '@/types';
import { soundingService } from '@/services/soundingService';
import { calculateIndices } from '@/modules/meteorologicalIndices';
import { dataCleaner } from '@/modules/dataFusion';
import { exportReport } from '@/modules/export';

const { Option } = Select;
const { TabPane } = Tabs;

const DataAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>('54398');
  const [soundingData, setSoundingData] = useState<SoundingData | null>(null);
  const [indices, setIndices] = useState<{
    stability: MeteorologicalIndex[];
    wind: MeteorologicalIndex[];
    thermodynamic: MeteorologicalIndex[];
  } | null>(null);

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
      const data = await soundingService.getLatestSoundingData(stationId);
      const cleaned = dataCleaner.clean(data.dataPoints);
      const calculated = calculateIndices(cleaned.cleanedPoints);

      setSoundingData({ ...data, dataPoints: cleaned.cleanedPoints });
      setIndices({
        stability: Object.values(calculated.stability),
        wind: Object.values(calculated.wind),
        thermodynamic: Object.values(calculated.thermodynamic)
      });
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

  const handleExport = (format: 'excel' | 'pdf' | 'csv') => {
    if (!soundingData) return;
    exportReport({
      format,
      soundingData,
      indices,
      filename: `气象指标分析_${soundingData.stationId}_${soundingData.soundingTime}`
    });
    message.success(`导出${format.toUpperCase()}成功`);
  };

  const exportMenu: MenuProps = {
    items: [
      { key: 'excel', label: '导出 Excel', onClick: () => handleExport('excel') },
      { key: 'pdf', label: '导出 PDF', onClick: () => handleExport('pdf') },
      { key: 'csv', label: '导出 CSV', onClick: () => handleExport('csv') }
    ]
  };

  const indexColumns = [
    {
      title: '指标名称',
      dataIndex: 'name',
      key: 'name',
      width: 150
    },
    {
      title: '数值',
      dataIndex: 'value',
      key: 'value',
      width: 120,
      render: (v: number) => <strong>{v}</strong>
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 80
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description'
    }
  ];

  const getLevelTag = (value: number, type: string) => {
    if (type === 'cape') {
      if (value > 1000) return <Tag color="red">强</Tag>;
      if (value > 500) return <Tag color="orange">中</Tag>;
      return <Tag color="green">弱</Tag>;
    }
    if (type === 'kIndex') {
      if (value > 30) return <Tag color="red">高</Tag>;
      if (value > 20) return <Tag color="orange">中</Tag>;
      return <Tag color="green">低</Tag>;
    }
    return null;
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
        title="气象指标分析"
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
            <Dropdown menu={exportMenu}>
              <Button type="primary" icon={<DownloadOutlined />}>
                导出报告
              </Button>
            </Dropdown>
          </Space>
        }
      >
        {soundingData && (
          <Row gutter={16} style={{ marginBottom: 16 }}>
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
                <div className="stat-label">数据层数</div>
              </div>
            </Col>
            <Col span={6}>
              <div className="stat-card">
                <div className="stat-value">{soundingData.maxHeight} m</div>
                <div className="stat-label">最大探测高度</div>
              </div>
            </Col>
          </Row>
        )}
      </Card>

      {indices && (
        <Tabs defaultActiveKey="stability">
          <TabPane
            tab={
              <span>
                <ThunderboltOutlined />
                稳定度指标
              </span>
            }
            key="stability"
          >
            <Card className="card-shadow">
              <Table
                dataSource={indices.stability}
                columns={[
                  ...indexColumns,
                  {
                    title: '等级',
                    key: 'level',
                    width: 80,
                    render: (_: any, record: MeteorologicalIndex) => {
                      if (record.name === 'CAPE') return getLevelTag(record.value, 'cape');
                      if (record.name === 'K指数') return getLevelTag(record.value, 'kIndex');
                      return null;
                    }
                  }
                ]}
                rowKey="name"
                pagination={false}
                expandable={{
                  expandedRowRender: (record: any) => (
                    <p style={{ margin: 0 }}>
                      <strong>计算方法：</strong>{record.calculationMethod}
                    </p>
                  )
                }}
              />
            </Card>
          </TabPane>

          <TabPane
            tab={
              <span>
                <WindOutlined />
                风场指标
              </span>
            }
            key="wind"
          >
            <Card className="card-shadow">
              <Table
                dataSource={indices.wind}
                columns={indexColumns}
                rowKey="name"
                pagination={false}
                expandable={{
                  expandedRowRender: (record: any) => (
                    <p style={{ margin: 0 }}>
                      <strong>计算方法：</strong>{record.calculationMethod}
                    </p>
                  )
                }}
              />
            </Card>
          </TabPane>

          <TabPane
            tab={
              <span>
                <ThermometerOutlined />
                热力学指标
              </span>
            }
            key="thermodynamic"
          >
            <Card className="card-shadow">
              <Table
                dataSource={indices.thermodynamic}
                columns={indexColumns}
                rowKey="name"
                pagination={false}
                expandable={{
                  expandedRowRender: (record: any) => (
                    <p style={{ margin: 0 }}>
                      <strong>计算方法：</strong>{record.calculationMethod}
                    </p>
                  )
                }}
              />
            </Card>
          </TabPane>
        </Tabs>
      )}

      {soundingData && (
        <Card className="card-shadow" style={{ marginTop: 16 }} title="数据质量评估">
          <DataQualityDisplay points={soundingData.dataPoints} />
        </Card>
      )}
    </div>
  );
};

const DataQualityDisplay: React.FC<{ points: any[] }> = ({ points }) => {
  const report = dataCleaner.clean(points).qualityReport;

  return (
    <Row gutter={16}>
      <Col span={6}>
        <div className="quality-score">
          <div
            className="score-circle"
            style={{
              background: report.qualityScore >= 80 ? '#52c41a' : report.qualityScore >= 60 ? '#faad14' : '#ff4d4f',
              color: '#fff',
              width: 100,
              height: 100,
              fontSize: 32
            }}
          >
            {report.qualityScore}
          </div>
          <div className="score-label" style={{ fontSize: 16 }}>
            综合质量评分
          </div>
        </div>
      </Col>
      <Col span={6}>
        <div style={{ padding: '20px 0' }}>
          <p><strong>总数据点数：</strong>{report.totalPoints}</p>
          <p><strong>有效数据点数：</strong>{report.validPoints}</p>
          <p><strong>无效数据点数：</strong>{report.invalidPoints}</p>
          <p>
            <strong>合格率：</strong>
            <Tag color={report.qualityScore >= 80 ? 'green' : 'orange'}>
              {((report.validPoints / report.totalPoints) * 100).toFixed(1)}%
            </Tag>
          </p>
        </div>
      </Col>
      <Col span={12}>
        <div style={{ padding: '20px 0' }}>
          <p><strong>字段缺失统计：</strong></p>
          <Row gutter={[8, 8]}>
            {Object.entries(report.missingFields).map(([key, value]) => (
              <Col span={12} key={key}>
                {key}: {value as number} 个
                {(value as number) > 0 && <Tag color="orange">异常</Tag>}
              </Col>
            ))}
          </Row>
        </div>
      </Col>
    </Row>
  );
};

export default DataAnalysis;
