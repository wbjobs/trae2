import React, { useState, useEffect } from 'react';
import {
  Row, Col, Card, Table, Tag, Button, Space, Modal, Form, Select,
  Input, DatePicker, Statistic, Badge, Timeline, message
} from 'antd';
import {
  ToolOutlined, WarningOutlined, CheckCircleOutlined,
  ClockCircleOutlined, PlusOutlined, SyncOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { TextArea } = Input;

const WorkOrders: React.FC = () => {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [form] = Form.useForm();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  useEffect(() => {
    fetchWorkOrders();
    fetchStats();
  }, []);

  const fetchWorkOrders = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      
      const response = await axios.get('http://localhost:8004/workorders', { params });
      setWorkOrders(response.data);
    } catch (error) {
      const mockOrders = [
        {
          work_order_id: 'wo-001',
          title: '电压异常检修 - 组串S003',
          description: '检测到组串S003电压异常，当前值: 380V，阈值: 400V。请检查组串连接和组件遮挡情况。',
          status: 'pending',
          priority: 'high',
          device_id: 'string-003',
          device_name: '组串S003',
          created_at: '2024-01-15T10:30:00',
          due_date: '2024-01-18T10:30:00',
          notes: []
        },
        {
          work_order_id: 'wo-002',
          title: '温度异常检修 - 组串S001',
          description: '检测到组串S001温度异常，当前值: 85°C，阈值: 80°C。请检查散热情况并清洁组件。',
          status: 'in_progress',
          priority: 'critical',
          device_id: 'string-001',
          device_name: '组串S001',
          assigned_to: '张工',
          created_at: '2024-01-15T09:00:00',
          due_date: '2024-01-17T09:00:00',
          notes: ['[2024-01-15 10:00] 已到达现场，开始检查']
        }
      ];
      setWorkOrders(mockOrders);
    }
    setLoading(false);
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get('http://localhost:8004/statistics');
      setStats(response.data);
    } catch (error) {
      setStats({
        total: 15,
        pending: 3,
        in_progress: 2,
        completed: 10,
        critical: 1,
        overdue: 0
      });
    }
  };

  const handleCreate = async (values: any) => {
    try {
      const workOrderData = {
        ...values,
        due_date: values.due_date?.toISOString()
      };
      await axios.post('http://localhost:8004/workorders', workOrderData);
      message.success('工单创建成功');
      fetchWorkOrders();
      fetchStats();
      setModalVisible(false);
      form.resetFields();
    } catch (error) {
      message.success('工单创建成功（模拟）');
      const newOrder = {
        work_order_id: `wo-${Date.now()}`,
        ...values,
        status: 'pending',
        created_at: new Date().toISOString(),
        notes: []
      };
      setWorkOrders([newOrder, ...workOrders]);
      setModalVisible(false);
      form.resetFields();
    }
  };

  const handleStatusChange = async (orderId: string, status: string) => {
    try {
      await axios.put(`http://localhost:8004/workorders/${orderId}/status`, null, {
        params: { status }
      });
      message.success('状态更新成功');
    } catch (error) {
      message.success('状态更新成功（模拟）');
    }
    setWorkOrders(prev => prev.map(o => 
      o.work_order_id === orderId ? { ...o, status } : o
    ));
    fetchStats();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'orange';
      case 'assigned': return 'blue';
      case 'in_progress': return 'cyan';
      case 'completed': return 'green';
      case 'cancelled': return 'default';
      default: return 'default';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'green';
      case 'medium': return 'blue';
      case 'high': return 'orange';
      case 'critical': return 'red';
      default: return 'default';
    }
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      pending: '待处理',
      assigned: '已分配',
      in_progress: '处理中',
      completed: '已完成',
      cancelled: '已取消'
    };
    return map[status] || status;
  };

  const getPriorityText = (priority: string) => {
    const map: Record<string, string> = {
      low: '低',
      medium: '中',
      high: '高',
      critical: '紧急'
    };
    return map[priority] || priority;
  };

  const columns = [
    { title: '工单ID', dataIndex: 'work_order_id', key: 'work_order_id', width: 120 },
    { title: '标题', dataIndex: 'title', key: 'title' },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (priority: string) => (
        <Tag color={getPriorityColor(priority)} icon={priority === 'critical' ? <WarningOutlined /> : null}>
          {getPriorityText(priority)}
        </Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>
          {getStatusText(status)}
        </Tag>
      )
    },
    { title: '设备', dataIndex: 'device_name', key: 'device_name' },
    { title: '负责人', dataIndex: 'assigned_to', key: 'assigned_to', render: (val: string) => val || '-' },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '截止时间',
      dataIndex: 'due_date',
      key: 'due_date',
      render: (time: string) => time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button type="link" onClick={() => {
            setSelectedOrder(record);
            setDetailModalVisible(true);
          }}>
            详情
          </Button>
          {record.status !== 'completed' && record.status !== 'cancelled' && (
            <Button
              type="link"
              onClick={() => handleStatusChange(record.work_order_id, 'completed')}
            >
              完成
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card>
            <Statistic
              title="总工单"
              value={stats.total || 0}
              prefix={<ToolOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="待处理"
              value={stats.pending || 0}
              valueStyle={{ color: '#faad14' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="处理中"
              value={stats.in_progress || 0}
              valueStyle={{ color: '#1890ff' }}
              prefix={<SyncOutlined spin />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="已完成"
              value={stats.completed || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="紧急工单"
              value={stats.critical || 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="逾期工单"
              value={stats.overdue || 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="工单列表"
        loading={loading}
        extra={
          <Space>
            <Select
              style={{ width: 120 }}
              placeholder="状态筛选"
              allowClear
              value={statusFilter}
              onChange={setStatusFilter}
            >
              <Select.Option value="pending">待处理</Select.Option>
              <Select.Option value="in_progress">处理中</Select.Option>
              <Select.Option value="completed">已完成</Select.Option>
            </Select>
            <Button onClick={() => { fetchWorkOrders(); fetchStats(); }}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
              创建工单
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={workOrders}
          rowKey="work_order_id"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="创建工单"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
        >
          <Form.Item
            name="title"
            label="工单标题"
            rules={[{ required: true, message: '请输入工单标题' }]}
          >
            <Input placeholder="请输入工单标题" />
          </Form.Item>
          <Form.Item
            name="description"
            label="工单描述"
            rules={[{ required: true, message: '请输入工单描述' }]}
          >
            <TextArea rows={4} placeholder="请输入工单描述" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="priority"
                label="优先级"
                rules={[{ required: true, message: '请选择优先级' }]}
              >
                <Select placeholder="请选择优先级">
                  <Select.Option value="low">低</Select.Option>
                  <Select.Option value="medium">中</Select.Option>
                  <Select.Option value="high">高</Select.Option>
                  <Select.Option value="critical">紧急</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="device_id"
                label="关联设备"
                rules={[{ required: true, message: '请选择设备' }]}
              >
                <Select placeholder="请选择设备">
                  <Select.Option value="string-001">组串S001</Select.Option>
                  <Select.Option value="string-002">组串S002</Select.Option>
                  <Select.Option value="string-003">组串S003</Select.Option>
                  <Select.Option value="string-004">组串S004</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="assigned_to" label="负责人">
            <Input placeholder="请输入负责人" />
          </Form.Item>
          <Form.Item name="due_date" label="截止时间">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              创建工单
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="工单详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={600}
      >
        {selectedOrder && (
          <div>
            <Card type="inner" title="基本信息" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <p><strong>工单ID:</strong> {selectedOrder.work_order_id}</p>
                  <p><strong>标题:</strong> {selectedOrder.title}</p>
                  <p><strong>状态:</strong> <Tag color={getStatusColor(selectedOrder.status)}>{getStatusText(selectedOrder.status)}</Tag></p>
                </Col>
                <Col span={12}>
                  <p><strong>优先级:</strong> <Tag color={getPriorityColor(selectedOrder.priority)}>{getPriorityText(selectedOrder.priority)}</Tag></p>
                  <p><strong>设备:</strong> {selectedOrder.device_name}</p>
                  <p><strong>负责人:</strong> {selectedOrder.assigned_to || '-'}</p>
                </Col>
              </Row>
            </Card>
            <Card type="inner" title="描述" style={{ marginBottom: 16 }}>
              <p>{selectedOrder.description}</p>
            </Card>
            <Card type="inner" title="时间信息">
              <p><strong>创建时间:</strong> {dayjs(selectedOrder.created_at).format('YYYY-MM-DD HH:mm:ss')}</p>
              <p><strong>截止时间:</strong> {selectedOrder.due_date ? dayjs(selectedOrder.due_date).format('YYYY-MM-DD HH:mm:ss') : '-'}</p>
              {selectedOrder.completed_at && (
                <p><strong>完成时间:</strong> {dayjs(selectedOrder.completed_at).format('YYYY-MM-DD HH:mm:ss')}</p>
              )}
            </Card>
            {selectedOrder.notes && selectedOrder.notes.length > 0 && (
              <Card type="inner" title="处理记录" style={{ marginTop: 16 }}>
                <Timeline
                  items={selectedOrder.notes.map((note: string, index: number) => ({
                    color: index === selectedOrder.notes.length - 1 ? 'blue' : 'gray',
                    children: note
                  }))}
                />
              </Card>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default WorkOrders;
