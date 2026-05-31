import { useState, useEffect } from 'react';
import {
  Card,
  Tabs,
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Select,
  DatePicker,
  Input,
  message,
  Popconfirm,
  Row,
  Col,
  Descriptions,
  Empty,
  Tag as AntTag
} from 'antd';
import {
  ShareAltOutlined,
  UserOutlined,
  TeamOutlined,
  GlobalOutlined,
  LockOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { sharingService, userService, specimenService } from '../../services/specimen.service';
import { useAuthStore } from '../../store/authStore';
import dayjs, { Dayjs } from 'dayjs';

const { Option } = Select;
const { RangePicker } = DatePicker;

enum SharingLevel {
  PRIVATE = 'private',
  INTERNAL = 'internal',
  PUBLIC = 'public'
}

const SharingCenter: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<'sharedByMe' | 'sharedWithMe'>('sharedByMe');
  const [sharedByMe, setSharedByMe] = useState<any[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSharing, setEditingSharing] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [specimens, setSpecimens] = useState<any[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    if (activeTab === 'sharedByMe') {
      loadSharedByMe();
    } else {
      loadSharedWithMe();
    }
  }, [activeTab]);

  useEffect(() => {
    loadUsers();
    loadSpecimens();
  }, []);

  const loadUsers = async () => {
    try {
      const result = await userService.getUsers({ limit: 100 });
      setUsers(result.users || []);
    } catch (error) {
      console.error('加载用户列表失败:', error);
    }
  };

  const loadSpecimens = async () => {
    try {
      const result = await specimenService.getSpecimens({ limit: 100 });
      setSpecimens(result.specimens || []);
    } catch (error) {
      console.error('加载标本列表失败:', error);
    }
  };

  const loadSharedByMe = async () => {
    setLoading(true);
    try {
      const result = await sharingService.getMySharedSpecimens();
      setSharedByMe(result.sharings || []);
    } catch (error) {
      message.error('加载我共享的标本失败');
    } finally {
      setLoading(false);
    }
  };

  const loadSharedWithMe = async () => {
    setLoading(true);
    try {
      const result = await sharingService.getSharedWithMe();
      setSharedWithMe(result.sharings || []);
    } catch (error) {
      message.error('加载共享给我的标本失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingSharing(null);
    form.resetFields();
    form.setFieldsValue({
      sharingLevel: SharingLevel.INTERNAL,
      permissions: 'read'
    });
    setModalVisible(true);
  };

  const handleEdit = (sharing: any) => {
    setEditingSharing(sharing);
    form.setFieldsValue({
      ...sharing,
      expiresAt: sharing.expiresAt ? dayjs(sharing.expiresAt) : null
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await sharingService.deleteSharing(id);
      message.success('删除成功');
      loadSharedByMe();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const data = {
        ...values,
        expiresAt: values.expiresAt ? values.expiresAt.toISOString() : null
      };

      if (editingSharing) {
        await sharingService.updateSharing(editingSharing.id, data);
        message.success('更新成功');
      } else {
        await sharingService.createSharing(data);
        message.success('创建成功');
      }

      setModalVisible(false);
      loadSharedByMe();
    } catch (error) {
      message.error(editingSharing ? '更新失败' : '创建失败');
    }
  };

  const getSharingLevelInfo = (level: SharingLevel) => {
    const info = {
      [SharingLevel.PRIVATE]: { icon: <LockOutlined />, color: 'default', text: '私有共享' },
      [SharingLevel.INTERNAL]: { icon: <TeamOutlined />, color: 'blue', text: '机构内部' },
      [SharingLevel.PUBLIC]: { icon: <GlobalOutlined />, color: 'green', text: '公开共享' }
    };
    return info[level] || info[SharingLevel.PRIVATE];
  };

  const sharedByMeColumns = [
    {
      title: '标本',
      dataIndex: 'specimen',
      key: 'specimen',
      render: (specimen: any) => (
        <Space>
          <Button
            type="link"
            onClick={() => navigate(`/specimens/${specimen?.id}`)}
          >
            {specimen?.name}
          </Button>
          <Tag color="blue">{specimen?.specimenNo}</Tag>
        </Space>
      )
    },
    {
      title: '共享级别',
      dataIndex: 'sharingLevel',
      key: 'sharingLevel',
      render: (level: SharingLevel) => {
        const info = getSharingLevelInfo(level);
        return (
          <Tag icon={info.icon} color={info.color}>
            {info.text}
          </Tag>
        );
      }
    },
    {
      title: '共享给',
      dataIndex: 'sharedWithUser',
      key: 'sharedWithUser',
      render: (u: any, record: any) => {
        if (record.sharingLevel === SharingLevel.PUBLIC) return '所有人';
        if (record.sharingLevel === SharingLevel.INTERNAL) return '机构内部';
        return u?.fullName || '-';
      }
    },
    {
      title: '权限',
      dataIndex: 'permissions',
      key: 'permissions',
      render: (perm: string) => (
        <Tag color={perm === 'write' ? 'orange' : 'green'}>
          {perm === 'write' ? '编辑' : '只读'}
        </Tag>
      )
    },
    {
      title: '过期时间',
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (date: Date) => {
        if (!date) return <Tag color="default">永不过期</Tag>;
        const isExpired = new Date(date) < new Date();
        return (
          <Tag color={isExpired ? 'red' : 'blue'}>
            {isExpired ? '已过期' : dayjs(date).format('YYYY-MM-DD')}
          </Tag>
        );
      }
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
      render: (_: any, record: any) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/specimens/${record.specimenId}`)}
          >
            查看
          </Button>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个共享吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const sharedWithMeColumns = [
    {
      title: '标本',
      dataIndex: 'specimen',
      key: 'specimen',
      render: (specimen: any) => (
        <Space>
          <Button
            type="link"
            onClick={() => navigate(`/specimens/${specimen?.id}`)}
          >
            {specimen?.name}
          </Button>
          <Tag color="blue">{specimen?.specimenNo}</Tag>
        </Space>
      )
    },
    {
      title: '共享人',
      dataIndex: 'sharedByUser',
      key: 'sharedByUser',
      render: (u: any) => u?.fullName || '-'
    },
    {
      title: '部门',
      dataIndex: ['sharedByUser', 'department'],
      key: 'department'
    },
    {
      title: '共享级别',
      dataIndex: 'sharingLevel',
      key: 'sharingLevel',
      render: (level: SharingLevel) => {
        const info = getSharingLevelInfo(level);
        return (
          <Tag icon={info.icon} color={info.color}>
            {info.text}
          </Tag>
        );
      }
    },
    {
      title: '权限',
      dataIndex: 'permissions',
      key: 'permissions',
      render: (perm: string) => (
        <Tag color={perm === 'write' ? 'orange' : 'green'}>
          {perm === 'write' ? '编辑' : '只读'}
        </Tag>
      )
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
      render: (_: any, record: any) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/specimens/${record.specimenId}`)}
        >
          查看
        </Button>
      )
    }
  ];

  const tabItems = [
    {
      key: 'sharedByMe',
      label: (
        <span>
          <ShareAltOutlined /> 我共享的
        </span>
      )
    },
    {
      key: 'sharedWithMe',
      label: (
        <span>
          <UserOutlined /> 共享给我的
        </span>
      )
    }
  ];

  return (
    <div>
      <Card>
        <div className="page-header">
          <div className="page-title">
            <ShareAltOutlined style={{ fontSize: 20, marginRight: 8 }} />
            <h2 style={{ margin: 0 }}>共享中心</h2>
          </div>
          {activeTab === 'sharedByMe' && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新建共享
            </Button>
          )}
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'sharedByMe' | 'sharedWithMe')}
          items={tabItems}
        />

        {activeTab === 'sharedByMe' ? (
          <Table
            columns={sharedByMeColumns}
            dataSource={sharedByMe}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: false,
              total: sharedByMe.length
            }}
          />
        ) : (
          <Table
            columns={sharedWithMeColumns}
            dataSource={sharedWithMe}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: false,
              total: sharedWithMe.length
            }}
          />
        )}
      </Card>

      <Modal
        title={editingSharing ? '编辑共享' : '新建共享'}
        open={modalVisible}
        onOk={form.submit}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="specimenId"
            label="选择标本"
            rules={[{ required: true, message: '请选择要共享的标本' }]}
          >
            <Select
              placeholder="请选择标本"
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.children as string)?.toLowerCase().includes(input.toLowerCase())
              }
            >
              {specimens.map(s => (
                <Option key={s.id} value={s.id}>
                  {s.name} ({s.specimenNo})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="sharingLevel"
            label="共享级别"
            rules={[{ required: true, message: '请选择共享级别' }]}
          >
            <Select>
              <Option value={SharingLevel.PUBLIC}>
                <GlobalOutlined /> 公开共享 - 所有登录用户可见
              </Option>
              <Option value={SharingLevel.INTERNAL}>
                <TeamOutlined /> 机构内部 - 本机构用户可见
              </Option>
              <Option value={SharingLevel.PRIVATE}>
                <LockOutlined /> 私有共享 - 指定用户可见
              </Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, curValues) => prevValues.sharingLevel !== curValues.sharingLevel}
          >
            {({ getFieldValue }) =>
              getFieldValue('sharingLevel') === SharingLevel.PRIVATE ? (
                <Form.Item
                  name="sharedWith"
                  label="共享给"
                  rules={[{ required: true, message: '请选择要共享给的用户' }]}
                >
                  <Select
                    placeholder="请选择用户"
                    showSearch
                    optionFilterProp="children"
                  >
                    {users
                      .filter(u => u.id !== user?.id)
                      .map(u => (
                        <Option key={u.id} value={u.id}>
                          {u.fullName} ({u.department || u.role})
                        </Option>
                      ))}
                  </Select>
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item name="permissions" label="权限">
            <Select>
              <Option value="read">只读权限</Option>
              <Option value="write">编辑权限</Option>
            </Select>
          </Form.Item>

          <Form.Item name="expiresAt" label="过期时间">
            <DatePicker
              style={{ width: '100%' }}
              placeholder="选择过期时间（留空则永不过期）"
              showTime
              minDate={dayjs()}
            />
          </Form.Item>
        </Form>
      </Modal>

      <style>{`
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .page-title {
          display: flex;
          align-items: center;
        }
      `}</style>
    </div>
  );
};

export default SharingCenter;
