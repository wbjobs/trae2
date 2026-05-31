import { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Space,
  DatePicker,
  Input,
  Select,
  Modal,
  Form,
  InputNumber,
  Popconfirm,
  message,
  Card,
  Row,
  Col,
  Tag
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EnvironmentOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { growthApi, resourceApi } from '../services/api';
import { GrowthRecord, Resource } from '../types';

const { RangePicker } = DatePicker;
const { Option } = Select;

const GrowthRecords = () => {
  const [records, setRecords] = useState<GrowthRecord[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [resourceFilter, setResourceFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GrowthRecord | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadResources();
  }, []);

  useEffect(() => {
    loadRecords();
  }, [pagination.current, pagination.pageSize, resourceFilter, dateRange]);

  const loadResources = async () => {
    try {
      const response = await resourceApi.getAll({ page_size: 1000 });
      if (response.success) {
        setResources(response.data);
      }
    } catch (error) {
      message.error('加载资源列表失败');
    }
  };

  const loadRecords = async () => {
    setLoading(true);
    try {
      const response = await growthApi.getAll({
        resource_id: resourceFilter,
        start_date: dateRange?.[0]?.format('YYYY-MM-DD'),
        end_date: dateRange?.[1]?.format('YYYY-MM-DD'),
        page: pagination.current,
        page_size: pagination.pageSize
      });
      setRecords(response.data);
      setPagination(prev => ({
        ...prev,
        total: response.pagination.total
      }));
    } catch (error) {
      message.error('加载生长记录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingRecord(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: GrowthRecord) => {
    setEditingRecord(record);
    form.setFieldsValue({
      ...record,
      record_date: dayjs(record.record_date)
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const submitData = {
        ...values,
        record_date: values.record_date.format('YYYY-MM-DD')
      };

      let response;

      if (editingRecord) {
        response = await growthApi.update(editingRecord.id, submitData);
      } else {
        response = await growthApi.create(submitData);
      }

      if (response.success) {
        message.success(editingRecord ? '更新成功' : '创建成功');
        setModalVisible(false);
        loadRecords();
      }
    } catch (error) {
      if (error.errorFields) return;
      message.error(editingRecord ? '更新失败' : '创建失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await growthApi.delete(id);
      if (response.success) {
        message.success('删除成功');
        loadRecords();
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const getResourceName = (resourceId: string) => {
    const resource = resources.find(r => r.id === resourceId);
    return resource ? `${resource.name} (${resource.scientific_name})` : resourceId;
  };

  const columns = [
    {
      title: '种质资源',
      dataIndex: 'resource_id',
      key: 'resource_id',
      width: 200,
      render: (id: string) => getResourceName(id)
    },
    {
      title: '记录日期',
      dataIndex: 'record_date',
      key: 'record_date',
      width: 110,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD')
    },
    { title: '树高(cm)', dataIndex: 'height_cm', key: 'height_cm', width: 100 },
    { title: '胸径(cm)', dataIndex: 'dbh_cm', key: 'dbh_cm', width: 100 },
    { title: '冠幅(m)', dataIndex: 'crown_width_m', key: 'crown_width_m', width: 100 },
    {
      title: '健康状况',
      dataIndex: 'health_status',
      key: 'health_status',
      width: 100,
      render: (status: string | null) => status ? (
        <Tag color={status === '优秀' ? 'green' : status === '一般' ? 'orange' : 'blue'}>{status}</Tag>
      ) : '-'
    },
    { title: '物候期', dataIndex: 'phenology', key: 'phenology', width: 100, render: (text: string | null) => text || '-' },
    { title: '记录人', dataIndex: 'recorder', key: 'recorder', width: 100, render: (text: string | null) => text || '-' },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: GrowthRecord) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除该记录？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Card>
        <div className="table-toolbar">
          <Space>
            <Select
              placeholder="选择种质资源"
              allowClear
              style={{ width: 250 }}
              value={resourceFilter}
              onChange={setResourceFilter}
              showSearch
              optionFilterProp="children"
            >
              {resources.map(res => (
                <Option key={res.id} value={res.id}>
                  {res.name} - {res.scientific_name}
                </Option>
              ))}
            </Select>
            <RangePicker
              value={dateRange as any}
              onChange={(dates) => setDateRange(dates as any)}
            />
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增记录
          </Button>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={records}
          loading={loading}
          scroll={{ x: 1300 }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
          onChange={(newPagination) => {
            setPagination({
              current: newPagination.current || 1,
              pageSize: newPagination.pageSize || 20,
              total: pagination.total
            });
          }}
        />
      </Card>

      <Modal
        title={editingRecord ? '编辑生长记录' : '新增生长记录'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="resource_id"
            label="种质资源"
            rules={[{ required: true, message: '请选择种质资源' }]}
          >
            <Select
              placeholder="请选择种质资源"
              showSearch
              optionFilterProp="children"
            >
              {resources.map(res => (
                <Option key={res.id} value={res.id}>
                  {res.name} - {res.scientific_name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="record_date"
            label="记录日期"
            rules={[{ required: true, message: '请选择记录日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="height_cm" label="树高(cm)">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="dbh_cm" label="胸径(cm)">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="crown_width_m" label="冠幅(m)">
                <InputNumber style={{ width: '100%' }} min={0} step={0.1} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="health_status" label="健康状况">
                <Select placeholder="请选择">
                  <Option value="优秀">优秀</Option>
                  <Option value="良好">良好</Option>
                  <Option value="一般">一般</Option>
                  <Option value="较差">较差</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phenology" label="物候期">
                <Input placeholder="如：开花期、结果期等" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="recorder" label="记录人">
            <Input placeholder="请输入记录人姓名" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default GrowthRecords;
