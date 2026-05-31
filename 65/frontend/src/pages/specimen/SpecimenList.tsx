import { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Input,
  Select,
  Space,
  Card,
  Tag,
  Image,
  Popconfirm,
  message
} from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { specimenService } from '../../services/specimen.service';
import { Specimen, SpecimenStatus } from '../../types';
import { useAuthStore, isCurator } from '../../store/authStore';
import dayjs from 'dayjs';

const { Search } = Input;
const { Option } = Select;

const SpecimenList: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    loadCategories();
    loadSpecimens();
  }, [page, pageSize, categoryFilter, statusFilter]);

  const loadCategories = async () => {
    try {
      const result = await specimenService.getCategories();
      setCategories(result.categories);
    } catch (error) {
      console.error('加载分类失败:', error);
    }
  };

  const loadSpecimens = async () => {
    setLoading(true);
    try {
      const result = await specimenService.getSpecimens({
        page,
        limit: pageSize,
        search: searchText,
        category: categoryFilter,
        status: statusFilter
      });
      setSpecimens(result.specimens);
      setTotal(result.total);
    } catch (error) {
      console.error('加载标本列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    loadSpecimens();
  };

  const handleDelete = async (id: number) => {
    try {
      await specimenService.deleteSpecimen(id);
      message.success('删除成功');
      loadSpecimens();
    } catch (error) {
      message.error('删除失败');
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

  const getPrimaryImage = (specimen: Specimen) => {
    if (specimen.images && specimen.images.length > 0) {
      return specimen.images[0].fileUrl;
    }
    return null;
  };

  const columns = [
    {
      title: '图片',
      dataIndex: 'images',
      key: 'image',
      width: 80,
      render: (_: any, record: Specimen) => {
        const imageUrl = getPrimaryImage(record);
        return imageUrl ? (
          <Image
            width={60}
            height={60}
            src={imageUrl}
            style={{ objectFit: 'cover', borderRadius: 4 }}
          />
        ) : (
          <div
            style={{
              width: 60,
              height: 60,
              background: '#f0f0f0',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            无图
          </div>
        );
      }
    },
    {
      title: '标本编号',
      dataIndex: 'specimenNo',
      key: 'specimenNo',
      width: 120
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '学名',
      dataIndex: 'scientificName',
      key: 'scientificName',
      ellipsis: true
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100
    },
    {
      title: '采集地点',
      dataIndex: 'collectionLocation',
      key: 'collectionLocation',
      ellipsis: true
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: SpecimenStatus) => getStatusTag(status)
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (date: Date) => dayjs(date).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_: any, record: Specimen) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/specimens/${record.id}`)}
          >
            查看
          </Button>
          {isCurator(user?.role) && (
            <>
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => navigate(`/specimens/${record.id}/edit`)}
              >
                编辑
              </Button>
              <Popconfirm
                title="确定要删除这个标本吗？"
                onConfirm={() => handleDelete(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button type="text" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <Card>
        <div className="action-bar">
          <Space wrap>
            <Search
              placeholder="搜索标本编号、名称、学名"
              allowClear
              enterButton={<SearchOutlined />}
              size="middle"
              style={{ width: 300 }}
              onSearch={handleSearch}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <Select
              placeholder="选择分类"
              allowClear
              style={{ width: 150 }}
              value={categoryFilter || undefined}
              onChange={(value) => {
                setCategoryFilter(value || '');
                setPage(1);
              }}
            >
              {categories.map((cat) => (
                <Option key={cat} value={cat}>
                  {cat}
                </Option>
              ))}
            </Select>
            <Select
              placeholder="选择状态"
              allowClear
              style={{ width: 120 }}
              value={statusFilter || undefined}
              onChange={(value) => {
                setStatusFilter(value || '');
                setPage(1);
              }}
            >
              <Option value="pending">待审核</Option>
              <Option value="verified">已审核</Option>
              <Option value="archived">已归档</Option>
            </Select>
            <Button onClick={loadSpecimens}>重置</Button>
          </Space>
          {isCurator(user?.role) && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/specimens/new')}
            >
              新增标本
            </Button>
          )}
        </div>

        <Table
          columns={columns}
          dataSource={specimens}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (page, pageSize) => {
              setPage(page);
              setPageSize(pageSize);
            }
          }}
        />
      </Card>
    </div>
  );
};

export default SpecimenList;
