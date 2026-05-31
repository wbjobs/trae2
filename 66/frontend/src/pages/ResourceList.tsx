import { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Space,
  Input,
  Select,
  Tag,
  Modal,
  Popconfirm,
  message,
  Card,
  Row,
  Col
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  EnvironmentOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { resourceApi, categoryApi } from '../services/api';
import { Resource, Category, PaginatedResponse } from '../types';

const { Search } = Input;
const { Option } = Select;

const ResourceList = () => {
  const navigate = useNavigate();
  const [resources, setResources] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [protectionFilter, setProtectionFilter] = useState<string | undefined>();

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadResources();
  }, [pagination.current, pagination.pageSize, searchText, categoryFilter, protectionFilter]);

  const loadCategories = async () => {
    try {
      const response = await categoryApi.getAll();
      if (response.success) {
        setCategories(response.data);
      }
    } catch (error) {
      message.error('加载分类数据失败');
    }
  };

  const loadResources = async () => {
    setLoading(true);
    try {
      const response: PaginatedResponse<Resource> = await resourceApi.getAll({
        page: pagination.current,
        page_size: pagination.pageSize,
        search: searchText || undefined,
        category_id: categoryFilter,
        protection_level: protectionFilter,
        sort_by: 'created_at',
        sort_order: 'desc'
      });
      setResources(response.data);
      setPagination(prev => ({
        ...prev,
        total: response.pagination.total
      }));
    } catch (error) {
      message.error('加载资源列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await resourceApi.delete(id);
      if (response.success) {
        message.success('删除成功');
        loadResources();
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

  const getCategoryName = (categoryId: string | null) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || '-';
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (text: string) => <strong>{text}</strong>
    },
    {
      title: '学名',
      dataIndex: 'scientific_name',
      key: 'scientific_name',
      width: 180,
      render: (text: string) => <em style={{ color: '#666' }}>{text}</em>
    },
    {
      title: '分类',
      dataIndex: 'category_id',
      key: 'category_id',
      width: 120,
      render: (id: string | null) => getCategoryName(id)
    },
    {
      title: '科属种',
      key: 'taxonomy',
      width: 200,
      render: (_: any, record: Resource) => (
        <div style={{ fontSize: 12 }}>
          <div>科: {record.family || '-'}</div>
          <div>属: {record.genus || '-'}</div>
          <div>种: {record.species || '-'}</div>
        </div>
      )
    },
    {
      title: '保护等级',
      dataIndex: 'protection_level',
      key: 'protection_level',
      width: 120,
      render: (level: string | null) => (
        level ? <Tag color={getProtectionLevelColor(level)}>{level}</Tag> : '-'
      )
    },
    {
      title: '分布地区',
      key: 'location',
      width: 150,
      render: (_: any, record: Resource) => (
        <Space>
          <EnvironmentOutlined style={{ color: '#006633' }} />
          <span>{record.province || '-'}{record.city ? ` / ${record.city}` : ''}</span>
        </Space>
      )
    },
    {
      title: '调查日期',
      dataIndex: 'survey_date',
      key: 'survey_date',
      width: 110
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right' as const,
      render: (_: any, record: Resource) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/resources/${record.id}`)}
          >
            详情
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => navigate(`/resources/${record.id}/edit`)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该种质资源？"
            description="删除后数据不可恢复"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
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
            <Search
              placeholder="搜索名称、学名、科属"
              allowClear
              onSearch={setSearchText}
              style={{ width: 250 }}
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
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/resources/new')}
          >
            新增种质资源
          </Button>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={resources}
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
    </div>
  );
};

export default ResourceList;
