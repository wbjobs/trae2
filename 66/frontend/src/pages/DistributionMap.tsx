import { useEffect, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Select,
  Table,
  Tag,
  Spin,
  message,
  Space,
  Statistic,
  Empty
} from 'antd';
import { EnvironmentOutlined, GlobalOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { resourceApi, categoryApi } from '../services/api';
import { Category } from '../types';

const { Option } = Select;

interface HeatmapPoint {
  name: string;
  value: [number, number, number];
  resource_count: number;
  province: string | null;
  city: string | null;
}

interface ProvinceData {
  province: string;
  city: string | null;
  resource_count: number;
  total_families: number;
  total_species: number;
  protected_count: number;
}

const DistributionMap = () => {
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);
  const [provinceData, setProvinceData] = useState<ProvinceData[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [protectionFilter, setProtectionFilter] = useState<string | undefined>();

  useEffect(() => {
    loadCategories();
    loadHeatmapData();
    loadProvinceData();
  }, []);

  useEffect(() => {
    loadHeatmapData();
  }, [categoryFilter, protectionFilter]);

  const loadCategories = async () => {
    try {
      const response = await categoryApi.getAll();
      if (response.success) {
        setCategories(response.data.filter(c => !c.parent_id));
      }
    } catch (error) {
      console.error('加载分类失败');
    }
  };

  const loadHeatmapData = async () => {
    setLoading(true);
    try {
      const response = await resourceApi.getHeatmapData({
        category_id: categoryFilter,
        protection_level: protectionFilter
      });
      if (response.success) {
        setHeatmapData(response.data);
      }
    } catch (error) {
      message.error('加载热力图数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadProvinceData = async () => {
    try {
      const response = await resourceApi.getProvinceDistribution();
      if (response.success) {
        setProvinceData(response.data);
      }
    } catch (error) {
      message.error('加载省份分布数据失败');
    }
  };

  const getScatterChartOption = () => {
    if (heatmapData.length === 0) return {};

    const maxValue = Math.max(...heatmapData.map(d => d.resource_count));

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const data = params.data;
          return `
            <div style="padding: 8px;">
              <div style="font-weight: bold; margin-bottom: 4px;">${data.name}</div>
              <div>经度: ${data.value[0].toFixed(4)}</div>
              <div>纬度: ${data.value[1].toFixed(4)}</div>
              <div>资源数量: <strong>${data.value[2]}</strong></div>
            </div>
          `;
        }
      },
      grid: {
        left: '10%',
        right: '10%',
        top: 50,
        bottom: 50
      },
      xAxis: {
        type: 'value',
        name: '经度',
        min: 70,
        max: 140,
        splitLine: { show: true }
      },
      yAxis: {
        type: 'value',
        name: '纬度',
        min: 15,
        max: 55,
        splitLine: { show: true }
      },
      visualMap: {
        min: 1,
        max: maxValue || 10,
        calculable: true,
        inRange: {
          color: ['#67e0e3', '#37a2da', '#ffdb5c', '#ff9f7f', '#fb7293', '#ff6b6b']
        },
        left: 'left',
        bottom: 20
      },
      series: [{
        type: 'effectScatter',
        data: heatmapData.map(d => ({
          name: d.name,
          value: [...d.value]
        })),
        symbolSize: (val: number[]) => Math.max(val[2] * 5, 10),
        showEffectOn: 'render',
        rippleEffect: { brushType: 'stroke' },
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 102, 51, 0.5)'
        }
      }]
    };
  };

  const getProvinceBarChartOption = () => {
    if (provinceData.length === 0) return {};

    const top10 = provinceData.slice(0, 10);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' }
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: top10.map(d => d.province),
        axisLabel: { rotate: 30 }
      },
      yAxis: { type: 'value', name: '资源数量' },
      series: [{
        type: 'bar',
        data: top10.map(d => d.resource_count),
        itemStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#006633' },
              { offset: 1, color: '#33aa66' }
            ]
          }
        },
        barWidth: '50%'
      }]
    };
  };

  const provinceColumns = [
    {
      title: '省份',
      dataIndex: 'province',
      key: 'province',
      render: (text: string) => (
        <Space>
          <EnvironmentOutlined style={{ color: '#006633' }} />
          <strong>{text}</strong>
        </Space>
      )
    },
    {
      title: '城市',
      dataIndex: 'city',
      key: 'city',
      render: (text: string | null) => text || '-'
    },
    {
      title: '资源数量',
      dataIndex: 'resource_count',
      key: 'resource_count',
      sorter: (a: ProvinceData, b: ProvinceData) => a.resource_count - b.resource_count,
      render: (value: number) => <Tag color="green">{value}</Tag>
    },
    {
      title: '科数',
      dataIndex: 'total_families',
      key: 'total_families'
    },
    {
      title: '种数',
      dataIndex: 'total_species',
      key: 'total_species'
    },
    {
      title: '保护物种',
      dataIndex: 'protected_count',
      key: 'protected_count',
      render: (value: number) => value > 0 ? (
        <Tag color="red">{value}</Tag>
      ) : value
    }
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Card
            title="资源分布热力图"
            extra={
              <Space>
                <Select
                  placeholder="选择分类"
                  allowClear
                  style={{ width: 150 }}
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                >
                  {categories.map(cat => (
                    <Option key={cat.id} value={cat.id}>{cat.name}</Option>
                  ))}
                </Select>
                <Select
                  placeholder="保护等级"
                  allowClear
                  style={{ width: 150 }}
                  value={protectionFilter}
                  onChange={setProtectionFilter}
                >
                  <Option value="国家一级保护">国家一级保护</Option>
                  <Option value="国家二级保护">国家二级保护</Option>
                </Select>
              </Space>
            }
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : heatmapData.length > 0 ? (
              <>
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  <Col span={8}>
                    <Statistic
                      title="分布地点数"
                      value={heatmapData.length}
                      prefix={<GlobalOutlined />}
                      valueStyle={{ color: '#006633' }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="总资源数量"
                      value={heatmapData.reduce((sum, d) => sum + d.resource_count, 0)}
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="覆盖省份数"
                      value={new Set(heatmapData.map(d => d.province)).size}
                      valueStyle={{ color: '#722ed1' }}
                    />
                  </Col>
                </Row>

                <ReactECharts
                  option={getScatterChartOption()}
                  style={{ height: 450 }}
                />
                <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 8 }}>
                  气泡大小表示资源数量，颜色表示资源密度
                </div>
              </>
            ) : (
              <Empty description="暂无分布数据" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Top 10 省份资源分布">
            {provinceData.length > 0 ? (
              <ReactECharts option={getProvinceBarChartOption()} style={{ height: 300 }} />
            ) : (
              <Empty description="暂无数据" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="各区域资源统计">
            {provinceData.length > 0 ? (
              <Table
                rowKey={(record) => `${record.province}-${record.city || 'unknown'}`}
                size="small"
                dataSource={provinceData}
                columns={provinceColumns}
                pagination={{ pageSize: 8 }}
              />
            ) : (
              <Empty description="暂无数据" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DistributionMap;
