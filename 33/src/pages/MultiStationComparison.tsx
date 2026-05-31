import React, { useState, useMemo } from 'react';
import {
  Row, Col, Card, Select, Button, Space, Spin, message,
  Radio, Divider, Checkbox, Tag, Tooltip, Dropdown, MenuProps
} from 'antd';
import { ReloadOutlined, DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useStationList, useMultiStationData } from '@/hooks/useSoundingData';
import { MultiStationComparison } from '@/components/charts/comparison/MultiStationComparison';
import { exportReport } from '@/modules/export';
import { comparisonExporter } from '@/modules/export/comparisonExporter';

const { Option } = Select;

const MultiStationComparisonPage: React.FC = () => {
  const { stations, loading: stationsLoading } = useStationList();
  const [selectedStations, setSelectedStations] = useState<string[]>(['54398', '58362']);
  const [selectedField, setSelectedField] = useState<'temperature' | 'dewPoint' | 'relativeHumidity' | 'windSpeed'>('temperature');

  const { dataList, loading: dataLoading } = useMultiStationData(selectedStations);

  const handleStationChange = (value: string[]) => {
    if (value.length > 5) {
      message.warning('最多支持同时对比5个站点');
      return;
    }
    setSelectedStations(value);
  };

  const handleExportComparison = () => {
    if (dataList.length === 0) {
      message.warning('没有可导出的数据');
      return;
    }

    try {
      comparisonExporter.exportComparison(
        dataList,
        selectedField,
        `多站点对比分析_${new Date().toISOString().slice(0, 10)}`
      );
      message.success('对比分析报告导出成功');
    } catch (error) {
      message.error('导出失败');
    }
  };

  const handleExportIndividual = () => {
    if (dataList.length === 0) {
      message.warning('没有可导出的数据');
      return;
    }

    dataList.forEach((data, index) => {
      setTimeout(() => {
        exportReport({
          format: 'excel',
          soundingData: data,
          filename: `对比数据_${data.stationId}_${data.soundingTime}`
        });
      }, index * 500);
    });

    message.success(`已导出 ${dataList.length} 个站点数据`);
  };

  const exportMenu: MenuProps = {
    items: [
      {
        key: 'comparison',
        label: '导出对比分析报告',
        onClick: handleExportComparison
      },
      {
        key: 'individual',
        label: '分别导出各站点数据',
        onClick: handleExportIndividual
      }
    ]
  };

  const statistics = useMemo(() => {
    if (dataList.length === 0) return null;

    const fieldKey = selectedField;
    const stats = dataList.map(data => {
      const values = data.dataPoints.map(p => p[fieldKey] as number);
      return {
        stationId: data.stationId,
        stationName: data.stationName,
        max: Math.max(...values),
        min: Math.min(...values),
        avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10,
        soundingTime: data.soundingTime
      };
    });

    return stats;
  }, [dataList, selectedField]);

  if (stationsLoading && stations.length === 0) {
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
        title="多站点廓线对比分析"
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => setSelectedStations([...selectedStations])}
              loading={dataLoading}
            >
              刷新数据
            </Button>
            <Dropdown menu={exportMenu} placement="bottomRight">
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                disabled={dataList.length === 0}
              >
                导出数据
              </Button>
            </Dropdown>
          </Space>
        }
      >
        <Row gutter={[16, 16]}>
          <Col span={16}>
            <div>
              <label style={{ marginRight: 8, fontWeight: 500 }}>选择站点：</label>
              <Select
                mode="multiple"
                placeholder="请选择要对比的站点（最多5个）"
                value={selectedStations}
                onChange={handleStationChange}
                style={{ width: '100%', maxWidth: 600 }}
                loading={stationsLoading}
                maxTagCount="responsive"
              >
                {stations.map(s => (
                  <Option key={s.stationId} value={s.stationId}>
                    {s.stationName} ({s.stationId})
                  </Option>
                ))}
              </Select>
            </div>
          </Col>
          <Col span={8}>
            <div>
              <label style={{ marginRight: 8, fontWeight: 500 }}>对比要素：</label>
              <Radio.Group
                value={selectedField}
                onChange={(e) => setSelectedField(e.target.value)}
              >
                <Radio.Button value="temperature">温度</Radio.Button>
                <Radio.Button value="dewPoint">露点</Radio.Button>
                <Radio.Button value="relativeHumidity">湿度</Radio.Button>
                <Radio.Button value="windSpeed">风速</Radio.Button>
              </Radio.Group>
            </div>
          </Col>
        </Row>

        {statistics && (
          <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
            <Row gutter={[16, 8]}>
              {statistics.map(stat => (
                <Col span={24 / dataList.length} key={stat.stationId}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{stat.stationName}</div>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                      {stat.soundingTime}
                    </div>
                    <Space size={[8, 4]} wrap>
                      <Tag color="blue">平均: {stat.avg}</Tag>
                      <Tag color="green">最低: {stat.min}</Tag>
                      <Tag color="red">最高: {stat.max}</Tag>
                    </Space>
                  </div>
                </Col>
              ))}
            </Row>
          </div>
        )}
      </Card>

      <Card className="card-shadow">
        {dataLoading ? (
          <div className="loading-container" style={{ minHeight: 500 }}>
            <Spin size="large" tip="数据加载中..." />
          </div>
        ) : (
          <MultiStationComparison
            data={dataList}
            field={selectedField}
            height="600px"
          />
        )}
      </Card>

      <Card className="card-shadow" style={{ marginTop: 16 }} title="数据说明">
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <h4 style={{ marginBottom: 8 }}>
              <InfoCircleOutlined style={{ marginRight: 4 }} />
              使用说明
            </h4>
            <ul style={{ paddingLeft: 20, color: '#666' }}>
              <li>支持最多同时对比5个站点的廓线数据</li>
              <li>可切换不同气象要素进行对比分析</li>
              <li>鼠标悬停在图表上可查看详细数值</li>
              <li>支持鼠标滚轮缩放查看特定高度范围</li>
              <li>点击图例可隐藏/显示对应站点数据</li>
            </ul>
          </Col>
          <Col span={12}>
            <h4 style={{ marginBottom: 8 }}>
              <InfoCircleOutlined style={{ marginRight: 4 }} />
              要素说明
            </h4>
            <ul style={{ paddingLeft: 20, color: '#666' }}>
              <li><strong>温度</strong>：大气温度随高度的分布廓线</li>
              <li><strong>露点</strong>：空气达到饱和时的温度，反映水汽含量</li>
              <li><strong>相对湿度</strong>：实际水汽压与饱和水汽压的百分比</li>
              <li><strong>风速</strong>：水平风速随高度的分布廓线</li>
            </ul>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default MultiStationComparisonPage;
