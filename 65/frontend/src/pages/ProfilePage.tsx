import { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Avatar,
  Descriptions,
  Tag,
  Tabs,
  message,
  Typography
} from 'antd';
import { UserOutlined, SaveOutlined } from '@ant-design/icons';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/auth.service';
import { UserRole } from '../types';
import dayjs from 'dayjs';

const { Title } = Typography;

const ProfilePage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const [loading, setLoading] = useState(false);
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  useEffect(() => {
    if (user) {
      profileForm.setFieldsValue({
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        department: user.department
      });
    }
  }, [user]);

  const getRoleTag = (role: UserRole) => {
    const roleMap = {
      [UserRole.ADMIN]: { color: 'red', text: '管理员' },
      [UserRole.CURATOR]: { color: 'blue', text: '策展人' },
      [UserRole.RESEARCHER]: { color: 'green', text: '研究员' },
      [UserRole.GUEST]: { color: 'default', text: '访客' }
    };
    const config = roleMap[role] || { color: 'default', text: role };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const handleProfileSubmit = async (values: any) => {
    setLoading(true);
    try {
      message.success('个人信息更新成功');
      if (user) {
        setUser({ ...user, ...values });
      }
    } catch (error) {
      message.error('更新失败');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (values: any) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      await authService.changePassword(values.oldPassword, values.newPassword);
      message.success('密码修改成功');
      passwordForm.resetFields();
    } catch (error) {
      message.error('密码修改失败');
    } finally {
      setLoading(false);
    }
  };

  const profileTabs = [
    {
      key: 'info',
      label: '基本信息',
      children: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card size="small">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="用户名">{user?.username}</Descriptions.Item>
              <Descriptions.Item label="角色">{user?.role && getRoleTag(user.role)}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{user?.email}</Descriptions.Item>
              <Descriptions.Item label="部门">{user?.department || '-'}</Descriptions.Item>
              <Descriptions.Item label="电话">{user?.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="最后登录">
                {user?.lastLogin ? dayjs(user.lastLogin).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="注册时间">
                {user?.createdAt ? dayjs(user.createdAt).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="编辑信息" size="small">
            <Form
              form={profileForm}
              layout="vertical"
              onFinish={handleProfileSubmit}
            >
              <Form.Item
                name="fullName"
                label="姓名"
                rules={[{ required: true, message: '请输入姓名' }]}
              >
                <Input placeholder="请输入姓名" />
              </Form.Item>
              <Form.Item
                name="email"
                label="邮箱"
                rules={[
                  { required: true, message: '请输入邮箱' },
                  { type: 'email', message: '请输入有效的邮箱地址' }
                ]}
              >
                <Input placeholder="请输入邮箱" />
              </Form.Item>
              <Form.Item name="phone" label="电话">
                <Input placeholder="请输入电话" />
              </Form.Item>
              <Form.Item name="department" label="部门">
                <Input placeholder="请输入部门" />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={loading}
                >
                  保存修改
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Space>
      )
    },
    {
      key: 'password',
      label: '修改密码',
      children: (
        <Card title="修改密码" size="small" style={{ maxWidth: 500 }}>
          <Form
            form={passwordForm}
            layout="vertical"
            onFinish={handlePasswordSubmit}
          >
            <Form.Item
              name="oldPassword"
              label="当前密码"
              rules={[{ required: true, message: '请输入当前密码' }]}
            >
              <Input.Password placeholder="请输入当前密码" />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label="新密码"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '密码至少6个字符' }
              ]}
            >
              <Input.Password placeholder="请输入新密码" />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label="确认新密码"
              rules={[{ required: true, message: '请确认新密码' }]}
            >
              <Input.Password placeholder="请再次输入新密码" />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={loading}
              >
                修改密码
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )
    }
  ];

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Avatar size={80} icon={<UserOutlined />} style={{ marginBottom: 16 }} />
        <Title level={4} style={{ margin: 0 }}>
          {user?.fullName}
        </Title>
        <div style={{ marginTop: 8 }}>
          {user?.role && getRoleTag(user.role)}
        </div>
      </div>

      <Tabs items={profileTabs} />
    </div>
  );
};

export default ProfilePage;
