import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Spin, message } from 'antd';
import {
  EnvironmentOutlined,
  TeamOutlined,
  SafetyOutlined,
  GlobalOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { resourceApi } from '../services/api';
import { ResourceStats } from '../types';

const Dashboard = () => {
  const [stats, setStats] = useState<ResourceStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await resourceApi.getStats();
      if (response.success) {
        setStats(response.data);
      }
    } catch (error) {
      message.error('加载统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryChartOption = () => {
    if (!stats?.category_stats) return {};

    return {
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', left: 'left' },
      series: [{
        name: '资源分类',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: false, position: 'center' },
        emphasis: {
          label: { show: true, fontSize: 18, fontWeight: 'bold' }
        },
        labelLine: { show: false },
        data: stats.category_stats.map(cat => ({
          value: cat.resource_count,
          name: cat.name
        }))
      }]
    };
  };

  const getProtectionChartOption = () => {
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [{
        name: '保护等级',
        type: 'pie',
        radius: '60%',
        data: [
          { value: stats?.level1_protected || 0, name: '国家一级保护' },
          { value: stats?.level2_protected || 0, name: '国家二级保护' },
          { value: (stats?.total_resources || 0) - (stats?.level1_protected || 0) - (stats?.level2_protected || 0), name: '普通保护' }
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }]
    };
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="种质资源总数"
              value={stats?.total_resources || 0}
              prefix={<EnvironmentOutlined style={{ color: '#006633' }} />}
              valueStyle={{ color: '#006633' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="科属种数量"
              value={`${stats?.total_families || 0} / ${stats?.total_genera || 0} / ${stats?.total_species || 0}`}
              prefix={<TeamOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="一级保护植物"
              value={stats?.level1_protected || 0}
              prefix={<SafetyOutlined style={{ color: '#f5222d' }} />}
              valueStyle={{ color: '#f5222d' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="分布省份"
              value={stats?.total_provinces || 0}
              prefix={<GlobalOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="资源分类统计">
            <ReactECharts option={getCategoryChartOption()} style={{ height: 350 }} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="保护等级分布">
            <ReactECharts option={getProtectionChartOption()} style={{ height: 350 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
