import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Button, Space, Spin, message } from 'antd';
import { DownloadOutlined, BarChartOutlined, ThunderboltOutlined, CloudOutlined } from '@ant-design/icons';
import { SoundingData } from '@/types';
import { soundingService } from '@/services/soundingService';
import { exportReport } from '@/modules/export';

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [latestData, setLatestData] = useState<SoundingData | null>(null);
  const [recentList, setRecentList] = useState<SoundingData[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [latest, list] = await Promise.all([
        soundingService.getLatestSoundingData('54398'),
        soundingService.getSoundingDataList({ pageNum: 1, pageSize: 5 })
      ]);
      setLatestData(latest);
      setRecentList(list.list);
    } catch (error) {
      message.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!latestData) return;
    exportReport({
      format: 'excel',
      soundingData: latestData,
      filename: `探空数据总览_${latestData.stationId}`
    });
    message.success('导出成功');
  };

  const columns = [
    {
      title: '站点',
      dataIndex: 'stationName',
      key: 'stationName'
    },
    {
      title: '探空时间',
      dataIndex: 'soundingTime',
      key: 'soundingTime'
    },
    {
      title: '数据点数',
      dataIndex: ['dataPoints', 'length'],
      key: 'pointCount'
    },
    {
      title: '最大高度',
      dataIndex: 'maxHeight',
      key: 'maxHeight',
      render: (h: number) => `${h} m`
    },
    {
      title: '数据质量',
      dataIndex: 'dataQuality',
      key: 'dataQuality',
      render: (q: string) => (
        <Tag color={q === 'good' ? 'green' : q === 'fair' ? 'orange' : 'red'}>
          {q === 'good' ? '优质' : q === 'fair' ? '一般' : '较差'}
        </Tag>
      )
    }
  ];

  if (loading) {
    return (
      <div className="loading-container">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card
            title="系统总览"
            extra={
              <Space>
                <Button icon={<DownloadOutlined />} onClick={handleExport}>
                  导出报表
                </Button>
                <Button type="primary" onClick={loadData}>
                  刷新数据
                </Button>
              </Space>
            }
          >
            <Row gutter={16}>
              <Col span={6}>
                <Statistic
                  title="接入站点数"
                  value={5}
                  prefix={<CloudOutlined />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="今日探空次数"
                  value={48}
                  prefix={<BarChartOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="数据总条数"
                  value={15234}
                  prefix={<ThunderboltOutlined />}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="数据合格率"
                  value={98.5}
                  suffix="%"
                  valueStyle={{ color: '#fa8c16' }}
                />
              </Col>
            </Row>
          </Card>
        </Col>

        <Col span={12}>
          <Card title="最新探空数据">
            {latestData && (
              <div>
                <p><strong>站点：</strong>{latestData.stationName} ({latestData.stationId})</p>
                <p><strong>探空时间：</strong>{latestData.soundingTime}</p>
                <p><strong>位置：</strong>{latestData.latitude.toFixed(4)}°N, {latestData.longitude.toFixed(4)}°E</p>
                <p><strong>海拔：</strong>{latestData.elevation} m</p>
                <p><strong>最大高度：</strong>{latestData.maxHeight} m</p>
                <p><strong>数据点数：</strong>{latestData.dataPoints.length}</p>
                <p><strong>地面温度：</strong>{latestData.dataPoints[0]?.temperature} °C</p>
                <p><strong>地面湿度：</strong>{latestData.dataPoints[0]?.relativeHumidity} %</p>
              </div>
            )}
          </Card>
        </Col>

        <Col span={12}>
          <Card title="最近探空记录">
            <Table
              dataSource={recentList}
              columns={columns}
              rowKey="soundingTime"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
