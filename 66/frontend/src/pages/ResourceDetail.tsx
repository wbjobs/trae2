import { useEffect, useState } from 'react';
import {
  Descriptions,
  Card,
  Row,
  Col,
  Tag,
  Space,
  Button,
  Table,
  Empty,
  Image,
  Tabs,
  Spin,
  message,
  Popconfirm,
  Modal,
  Form,
  Input,
  DatePicker,
  InputNumber
} from 'antd';
import {
  EditOutlined,
  ArrowLeftOutlined,
  DeleteOutlined,
  PlusOutlined,
  EnvironmentOutlined,
  LineChartOutlined
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { resourceApi, growthApi, imageApi } from '../services/api';
import { ResourceWithRelations, GrowthRecord, FieldImage, GrowthStats } from '../types';
import { getImageUrl } from '../utils/format';

const { TextArea } = Input;

const ResourceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [resource, setResource] = useState<ResourceWithRelations | null>(null);
  const [growthStats, setGrowthStats] = useState<GrowthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [growthModalVisible, setGrowthModalVisible] = useState(false);
  const [growthForm] = Form.useForm();

  useEffect(() => {
    if (id) {
      loadResourceDetail();
      loadGrowthStats();
    }
  }, [id]);

  const loadResourceDetail = async () => {
    setLoading(true);
    try {
      const response = await resourceApi.getById(id!);
      if (response.success) {
        setResource(response.data);
      }
    } catch (error) {
      message.error('加载资源详情失败');
    } finally {
      setLoading(false);
    }
  };

  const loadGrowthStats = async () => {
    try {
      const response = await growthApi.getStats(id!);
      if (response.success) {
        setGrowthStats(response.data);
      }
    } catch (error) {
      console.error('加载生长统计失败');
    }
  };

  const handleAddGrowthRecord = async () => {
    try {
      const values = await growthForm.validateFields();
      const response = await growthApi.create({
        resource_id: id,
        record_date: values.record_date.format('YYYY-MM-DD'),
        height_cm: values.height_cm,
        dbh_cm: values.dbh_cm,
        crown_width_m: values.crown_width_m,
        health_status: values.health_status,
        phenology: values.phenology,
        notes: values.notes
      });

      if (response.success) {
        message.success('添加生长记录成功');
        setGrowthModalVisible(false);
        growthForm.resetFields();
        loadResourceDetail();
        loadGrowthStats();
      }
    } catch (error) {
      if (error.errorFields) return;
      message.error('添加生长记录失败');
    }
  };

  const handleDeleteGrowthRecord = async (recordId: string) => {
    try {
      const response = await growthApi.delete(recordId);
      if (response.success) {
        message.success('删除成功');
        loadResourceDetail();
        loadGrowthStats();
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    try {
      const response = await imageApi.delete(imageId);
      if (response.success) {
        message.success('删除成功');
        loadResourceDetail();
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const getProtectionLevelColor = (level: string | null) => {
    switch (level) {
      case '国家一级保护': return 'red';
      case '国家二级保护': return 'orange';
      default: return 'green';
    }
  };

  const getGrowthChartOption = () => {
    if (!resource?.growth_records || resource.growth_records.length === 0) return {};

    const sortedRecords = [...resource.growth_records].sort(
      (a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime()
    );

    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['树高(cm)', '胸径(cm)'] },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: sortedRecords.map(r => dayjs(r.record_date).format('YYYY-MM-DD'))
      },
      yAxis: [
        { type: 'value', name: '树高(cm)' },
        { type: 'value', name: '胸径(cm)' }
      ],
      series: [
        {
          name: '树高(cm)',
          type: 'line',
          smooth: true,
          data: sortedRecords.map(r => r.height_cm),
          itemStyle: { color: '#006633' },
          areaStyle: { color: 'rgba(0, 102, 51, 0.2)' }
        },
        {
          name: '胸径(cm)',
          type: 'line',
          smooth: true,
          yAxisIndex: 1,
          data: sortedRecords.map(r => r.dbh_cm),
          itemStyle: { color: '#1890ff' }
        }
      ]
    };
  };

  const growthColumns = [
    {
      title: '记录日期',
      dataIndex: 'record_date',
      key: 'record_date',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD')
    },
    { title: '树高(cm)', dataIndex: 'height_cm', key: 'height_cm' },
    { title: '胸径(cm)', dataIndex: 'dbh_cm', key: 'dbh_cm' },
    { title: '冠幅(m)', dataIndex: 'crown_width_m', key: 'crown_width_m' },
    {
      title: '健康状况',
      dataIndex: 'health_status',
      key: 'health_status',
      render: (status: string | null) => status ? <Tag color={status === '优秀' ? 'green' : status === '一般' ? 'orange' : 'blue'}>{status}</Tag> : '-'
    },
    { title: '物候期', dataIndex: 'phenology', key: 'phenology', render: (text: string | null) => text || '-' },
    { title: '记录人', dataIndex: 'recorder', key: 'recorder', render: (text: string | null) => text || '-' },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: GrowthRecord) => (
        <Popconfirm
          title="确定删除该记录？"
          onConfirm={() => handleDeleteGrowthRecord(record.id)}
        >
          <Button type="link" danger icon={<DeleteOutlined />} size="small">
            删除
          </Button>
        </Popconfirm>
      )
    }
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!resource) {
    return <Empty description="资源不存在" />;
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/resources')}>
          返回列表
        </Button>
        <Button
          type="primary"
          icon={<EditOutlined />}
          onClick={() => navigate(`/resources/${id}/edit`)}
        >
          编辑信息
        </Button>
      </Space>

      <Card title={`${resource.name} - ${resource.scientific_name}`} style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered size="middle">
          <Descriptions.Item label="分类">
            {resource.category?.name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="保护等级">
            {resource.protection_level ? (
              <Tag color={getProtectionLevelColor(resource.protection_level)}>
                {resource.protection_level}
              </Tag>
            ) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="科">
            {resource.family || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="属">
            {resource.genus || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="种">
            {resource.species || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="原产地">
            {resource.origin || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="生境">
            {resource.habitat || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="海拔">
            {resource.altitude ? `${resource.altitude}m` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="分布位置" span={2}>
            <Space>
              <EnvironmentOutlined style={{ color: '#006633' }} />
              <span>
                {resource.address || '-'}
              </span>
              {resource.latitude && resource.longitude && (
                <Tag color="blue">
                  {resource.latitude.toFixed(4)}, {resource.longitude.toFixed(4)}
                </Tag>
              )}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="描述" span={2}>
            {resource.description || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="调查人">
            {resource.surveyor || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="调查日期">
            {resource.survey_date ? dayjs(resource.survey_date).format('YYYY-MM-DD') : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <div className="resource-detail-tabs">
        <Tabs
          items={[
            {
              key: 'growth',
              label: '生长记录',
              children: (
                <div>
                  {growthStats && (
                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                      <Col span={6}>
                        <Card size="small">
                          <div className="stat-card">
                            <div className="stat-value">{growthStats.total_records}</div>
                            <div className="stat-label">记录次数</div>
                          </div>
                        </Card>
                      </Col>
                      <Col span={6}>
                        <Card size="small">
                          <div className="stat-card">
                            <div className="stat-value">
                              {growthStats.height_change !== null
                                ? `${growthStats.height_change.toFixed(1)}cm`
                                : '-'}
                            </div>
                            <div className="stat-label">树高变化</div>
                          </div>
                        </Card>
                      </Col>
                      <Col span={6}>
                        <Card size="small">
                          <div className="stat-card">
                            <div className="stat-value">
                              {growthStats.dbh_change !== null
                                ? `${growthStats.dbh_change.toFixed(1)}cm`
                                : '-'}
                            </div>
                            <div className="stat-label">胸径变化</div>
                          </div>
                        </Card>
                      </Col>
                      <Col span={6}>
                        <Card size="small">
                          <div className="stat-card">
                            <div className="stat-value">
                              {growthStats.growth_rate_per_year?.height
                                ? `${growthStats.growth_rate_per_year.height.toFixed(1)}cm/年`
                                : '-'}
                            </div>
                            <div className="stat-label">年生长率</div>
                          </div>
                        </Card>
                      </Col>
                    </Row>
                  )}

                  {resource.growth_records.length > 0 && (
                    <div className="growth-chart-container">
                      <ReactECharts option={getGrowthChartOption()} style={{ height: 300 }} />
                    </div>
                  )}

                  <div style={{ marginBottom: 16 }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => setGrowthModalVisible(true)}
                    >
                      添加生长记录
                    </Button>
                  </div>

                  <Table
                    rowKey="id"
                    columns={growthColumns}
                    dataSource={resource.growth_records}
                    pagination={false}
                    size="small"
                    locale={{ emptyText: '暂无生长记录' }}
                  />
                </div>
              )
            },
            {
              key: 'images',
              label: '野外影像',
              children: (
                <div>
                  {resource.images.length === 0 ? (
                    <Empty description="暂无影像资料" />
                  ) : (
                    <Row gutter={[16, 16]}>
                      {resource.images.map(image => (
                        <Col xs={24} sm={12} md={8} lg={6} key={image.id}>
                          <Card
                            hoverable
                            cover={
                              <Image
                                src={getImageUrl(image.file_name)}
                                alt={image.description || image.original_name}
                                style={{ height: 180, objectFit: 'cover' }}
                                fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23f5f5f5' width='100' height='100'/%3E%3Ctext fill='%23999' font-family='Arial' font-size='12' x='50' y='50' text-anchor='middle' dominant-baseline='middle'%3E无预览%3C/text%3E%3C/svg%3E"
                              />
                            }
                            actions={[
                              <Popconfirm
                                title="确定删除该影像？"
                                onConfirm={() => handleDeleteImage(image.id)}
                              >
                                <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                                  删除
                                </Button>
                              </Popconfirm>
                            ]}
                          >
                            <Card.Meta
                              title={image.description || image.original_name}
                              description={
                                <div style={{ fontSize: 12 }}>
                                  {image.taken_date && (
                                    <div>拍摄日期: {dayjs(image.taken_date).format('YYYY-MM-DD')}</div>
                                  )}
                                  {image.location && <div>地点: {image.location}</div>}
                                  {image.photographer && <div>拍摄人: {image.photographer}</div>}
                                </div>
                              }
                            />
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  )}
                </div>
              )
            }
          ]}
        />
      </div>

      <Modal
        title="添加生长记录"
        open={growthModalVisible}
        onCancel={() => {
          setGrowthModalVisible(false);
          growthForm.resetFields();
        }}
        onOk={handleAddGrowthRecord}
        okText="保存"
        cancelText="取消"
      >
        <Form form={growthForm} layout="vertical">
          <Form.Item
            name="record_date"
            label="记录日期"
            rules={[{ required: true, message: '请选择记录日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="height_cm" label="树高(cm)">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="dbh_cm" label="胸径(cm)">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="crown_width_m" label="冠幅(m)">
                <InputNumber style={{ width: '100%' }} min={0} step={0.1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="health_status" label="健康状况">
                <Select placeholder="请选择">
                  <Select.Option value="优秀">优秀</Select.Option>
                  <Select.Option value="良好">良好</Select.Option>
                  <Select.Option value="一般">一般</Select.Option>
                  <Select.Option value="较差">较差</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="phenology" label="物候期">
            <Input placeholder="如：开花期、结果期等" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ResourceDetail;
