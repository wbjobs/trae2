import { useEffect, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Select,
  DatePicker,
  Table,
  Tag,
  Spin,
  message,
  Space,
  Statistic,
  Divider
} from 'antd';
import { BarChartOutlined, LineChartOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { growthApi, resourceApi, categoryApi } from '../services/api';
import { Category } from '../types';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface YearlyData {
  year: string;
  record_count: number;
  resources_tracked: number;
  avg_height_cm: number | null;
  avg_db_hcm: number | null;
  avg_crown_width_m: number | null;
  min_height_cm: number | null;
  max_height_cm: number | null;
  min_db_hcm: number | null;
  max_db_hcm: number | null;
}

interface GrowthTrend {
  resource_id: string;
  resource_name: string;
  scientific_name: string;
  family: string;
  category: string;
  yearly_data: Array<{
    year: string;
    first_height: number | null;
    last_height: number | null;
    first_dbh: number | null;
    last_dbh: number | null;
    height_growth: number | null;
    dbh_growth: number | null;
  }>;
}

const GrowthAnalysis = () => {
  const [yearlyData, setYearlyData] = useState<YearlyData[]>([]);
  const [growthTrends, setGrowthTrends] = useState<GrowthTrend[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [growthRanking, setGrowthRanking] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();

  useEffect(() => {
    loadCategories();
    loadYearlyData();
    loadGrowthTrends();
    loadGrowthRanking();
  }, []);

  useEffect(() => {
    loadYearlyData();
  }, [dateRange]);

  useEffect(() => {
    loadGrowthTrends();
  }, [categoryFilter]);

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

  const loadYearlyData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (dateRange?.[0]) params.start_year = dateRange[0].year();
      if (dateRange?.[1]) params.end_year = dateRange[1].year();

      const response = await growthApi.getYearlyComparison(params);
      if (response.success) {
        setYearlyData(response.data);
      }
    } catch (error) {
      message.error('加载年度数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadGrowthTrends = async () => {
    try {
      const response = await growthApi.getGrowthTrends({
        limit: 10,
        category_id: categoryFilter
      });
      if (response.success) {
        setGrowthTrends(response.data);
      }
    } catch (error) {
      message.error('加载生长趋势失败');
    }
  };

  const loadGrowthRanking = async () => {
    try {
      const response = await resourceApi.getGrowthRanking(10);
      if (response.success) {
        setGrowthRanking(response.data);
      }
    } catch (error) {
      message.error('加载生长排名失败');
    }
  };

  const getBarChartOption = () => {
    if (yearlyData.length === 0) return {};

    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['平均树高(cm)', '平均胸径(cm)'] },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: yearlyData.map(d => d.year)
      },
      yAxis: [
        { type: 'value', name: '树高(cm)' },
        { type: 'value', name: '胸径(cm)' }
      ],
      series: [
        {
          name: '平均树高(cm)',
          type: 'bar',
          data: yearlyData.map(d => d.avg_height_cm),
          itemStyle: { color: '#006633' }
        },
        {
          name: '平均胸径(cm)',
          type: 'bar',
          yAxisIndex: 1,
          data: yearlyData.map(d => d.avg_db_hcm),
          itemStyle: { color: '#1890ff' }
        }
      ]
    };
  };

  const getLineChartOption = () => {
    if (yearlyData.length === 0) return {};

    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['监测资源数量', '记录次数'] },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: yearlyData.map(d => d.year)
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: '监测资源数量',
          type: 'line',
          smooth: true,
          data: yearlyData.map(d => d.resources_tracked),
          itemStyle: { color: '#722ed1' },
          areaStyle: { color: 'rgba(114, 46, 209, 0.2)' }
        },
        {
          name: '记录次数',
          type: 'line',
          smooth: true,
          data: yearlyData.map(d => d.record_count),
          itemStyle: { color: '#fa8c16' }
        }
      ]
    };
  };

  const getTrendChartOption = (trend: GrowthTrend) => {
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: trend.yearly_data.map(d => d.year)
      },
      yAxis: [
        { type: 'value', name: '树高(cm)', splitLine: { show: false } },
        { type: 'value', name: '生长量(cm)', splitLine: { show: false } }
      ],
      series: [
        {
          name: '树高(cm)',
          type: 'bar',
          data: trend.yearly_data.map(d => d.last_height),
          itemStyle: { color: '#006633' }
        },
        {
          name: '年生长量(cm)',
          type: 'line',
          yAxisIndex: 1,
          data: trend.yearly_data.map(d => d.height_growth),
          itemStyle: { color: '#fa541c' },
          smooth: true
        }
      ]
    };
  };

  const rankingColumns = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: any, __: any, index: number) => (
        <Tag color={index < 3 ? ['red', 'orange', 'blue'][index] : 'default'}>
          {index + 1}
        </Tag>
      )
    },
    {
      title: '树种名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <div>
          <div><strong>{text}</strong></div>
          <div style={{ fontSize: 12, color: '#999' }}>
            <em>{record.scientific_name}</em>
          </div>
        </div>
      )
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      render: (text: string) => text || '-'
    },
    {
      title: '总生长量',
      dataIndex: 'total_growth',
      key: 'total_growth',
      render: (value: number) => value ? `${value} cm` : '-'
    },
    {
      title: '年均生长率',
      dataIndex: 'annual_growth_rate',
      key: 'annual_growth_rate',
      render: (value: number) => value ? `${value} cm/年` : '-',
      sorter: (a: any, b: any) => (a.annual_growth_rate || 0) - (b.annual_growth_rate || 0)
    },
    {
      title: '监测周期',
      dataIndex: 'monitoring_period',
      key: 'monitoring_period'
    },
    {
      title: '记录次数',
      dataIndex: 'record_count',
      key: 'record_count'
    }
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Card
            title="年度对比分析"
            extra={
              <Space>
                <RangePicker
                  picker="year"
                  value={dateRange as any}
                  onChange={(dates) => setDateRange(dates as any)}
                />
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
              </Space>
            }
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : yearlyData.length > 0 ? (
              <>
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  <Col span={6}>
                    <Statistic
                      title="监测年份"
                      value={`${yearlyData[0].year} - ${yearlyData[yearlyData.length - 1].year}`}
                      prefix={<BarChartOutlined />}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="总记录次数"
                      value={yearlyData.reduce((sum, d) => sum + d.record_count, 0)}
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="最新平均树高"
                      value={yearlyData[yearlyData.length - 1].avg_height_cm || 0}
                      suffix="cm"
                      valueStyle={{ color: '#006633' }}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="最新平均胸径"
                      value={yearlyData[yearlyData.length - 1].avg_db_hcm || 0}
                      suffix="cm"
                      valueStyle={{ color: '#722ed1' }}
                    />
                  </Col>
                </Row>

                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={12}>
                    <Card title="平均树高与胸径对比" size="small">
                      <ReactECharts option={getBarChartOption()} style={{ height: 280 }} />
                    </Card>
                  </Col>
                  <Col xs={24} lg={12}>
                    <Card title="监测资源与记录趋势" size="small">
                      <ReactECharts option={getLineChartOption()} style={{ height: 280 }} />
                    </Card>
                  </Col>
                </Row>

                <Divider />

                <Table
                  rowKey="year"
                  size="small"
                  dataSource={yearlyData}
                  pagination={false}
                  columns={[
                    { title: '年份', dataIndex: 'year', key: 'year', width: 80 },
                    { title: '监测资源数', dataIndex: 'resources_tracked', key: 'resources_tracked' },
                    { title: '记录次数', dataIndex: 'record_count', key: 'record_count' },
                    {
                      title: '平均树高(cm)',
                      dataIndex: 'avg_height_cm',
                      key: 'avg_height_cm',
                      render: (v: number) => v?.toFixed(1) || '-'
                    },
                    {
                      title: '平均胸径(cm)',
                      dataIndex: 'avg_db_hcm',
                      key: 'avg_db_hcm',
                      render: (v: number) => v?.toFixed(1) || '-'
                    },
                    {
                      title: '树高范围(cm)',
                      key: 'height_range',
                      render: (_: any, record: YearlyData) =>
                        `${record.min_height_cm?.toFixed(0) || '-'} - ${record.max_height_cm?.toFixed(0) || '-'}`
                    }
                  ]}
                />
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                暂无年度对比数据
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Card title="生长性能排行榜">
            <Table
              rowKey="id"
              columns={rankingColumns}
              dataSource={growthRanking}
              pagination={false}
              size="middle"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card title="各树种年度生长趋势" extra={<LineChartOutlined />}>
            {growthTrends.length > 0 ? (
              <Row gutter={[16, 16]}>
                {growthTrends.slice(0, 4).map((trend, index) => (
                  <Col xs={24} lg={12} key={trend.resource_id}>
                    <Card
                      size="small"
                      title={
                        <Space>
                          <strong>{trend.resource_name}</strong>
                          <Tag color="blue">{trend.category}</Tag>
                        </Space>
                      }
                      style={{ marginBottom: 16 }}
                    >
                      <ReactECharts
                        option={getTrendChartOption(trend)}
                        style={{ height: 200 }}
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                暂无趋势数据
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default GrowthAnalysis;
