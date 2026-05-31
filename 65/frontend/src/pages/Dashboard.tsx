import { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Tag,
  Space,
  Button,
  Typography
} from 'antd';
import {
  FileOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { specimenService } from '../services/specimen.service';
import { Specimen, SpecimenStatus } from '../types';
import dayjs from 'dayjs';

const { Title } = Typography;

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    verified: 0,
    archived: 0
  });
  const [recentSpecimens, setRecentSpecimens] = useState<Specimen[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsResult, specimensResult] = await Promise.all([
        specimenService.getStats(),
        specimenService.getSpecimens({ limit: 5, sortBy: 'createdAt', sortOrder: 'DESC' })
      ]);
      setStats(statsResult);
      setRecentSpecimens(specimensResult.specimens);
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusTag = (status: SpecimenStatus) => {
    const statusMap = {
      [SpecimenStatus.PENDING]: { color: 'orange', text: '待审核' },
      [SpecimenStatus.VERIFIED]: { color: 'green', text: '已审核' },
      [SpecimenStatus.ARCHIVED]: { color: 'blue', text: '已归档' }
    };
    const config = statusMap[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const columns = [
    {
      title: '标本编号',
      dataIndex: 'specimenNo',
      key: 'specimenNo'
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '学名',
      dataIndex: 'scientificName',
      key: 'scientificName'
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: SpecimenStatus) => getStatusTag(status)
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: Date) => dayjs(date).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Specimen) => (
        <Button type="link" onClick={() => navigate(`/specimens/${record.id}`)}>
          查看详情
        </Button>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <Space>
          <Title level={4} style={{ margin: 0 }}>
            数据概览
          </Title>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="标本总数"
              value={stats.total}
              prefix={<FileOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="待审核"
              value={stats.pending}
              prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="已审核"
              value={stats.verified}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="已归档"
              value={stats.archived}
              prefix={<InboxOutlined style={{ color: '#13c2c2' }} />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="最近新增标本"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/specimens/new')}
          >
            新增标本
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={recentSpecimens}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>
    </div>
  );
};

export default Dashboard;
