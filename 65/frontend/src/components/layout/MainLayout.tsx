import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Button,
  Typography,
  Space
} from 'antd';
import {
  DashboardOutlined,
  UnorderedListOutlined,
  ImageOutlined,
  EnvironmentOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
  ShareAltOutlined
} from '@ant-design/icons';
import { useAuthStore, isAdmin } from '../../store/authStore';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '控制台'
    },
    {
      key: '/specimens',
      icon: <UnorderedListOutlined />,
      label: '标本档案'
    },
    {
      key: '/search',
      icon: <SearchOutlined />,
      label: '智能检索'
    },
    {
      key: '/sharing',
      icon: <ShareAltOutlined />,
      label: '共享中心'
    },
    ...(isAdmin(user?.role)
      ? [
          {
            key: '/users',
            icon: <UserOutlined />,
            label: '用户管理'
          }
        ]
      : [])
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <SettingOutlined />,
      label: '个人设置',
      onClick: () => navigate('/profile')
    },
    {
      type: 'divider' as const
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout
    }
  ];

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/specimens') && path.includes('/images')) {
      return '影像预览';
    }
    if (path.startsWith('/specimens') && path.includes('/traceability')) {
      return '生态溯源';
    }
    if (path.startsWith('/specimens') && path.includes('/edit')) {
      return '编辑标本';
    }
    if (path.startsWith('/specimens/new')) {
      return '新增标本';
    }
    if (path.startsWith('/specimens') && path !== '/specimens') {
      return '标本详情';
    }
    const titles: Record<string, string> = {
      '/dashboard': '控制台',
      '/specimens': '标本档案',
      '/search': '智能检索',
      '/sharing': '共享中心',
      '/users': '用户管理',
      '/profile': '个人设置'
    };
    return titles[path] || '海洋生物标本系统';
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.1)'
          }}
        >
          {!collapsed && (
            <Title level={5} style={{ color: '#fff', margin: 0 }}>
              海洋生物标本系统
            </Title>
          )}
          {collapsed && <EnvironmentOutlined style={{ fontSize: 24, color: '#fff' }} />}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname.split('/').slice(0, 2).join('/')]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)'
          }}
        >
          <Space>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
            <Title level={4} style={{ margin: 0 }}>
              {getPageTitle()}
            </Title>
          </Space>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} />
              <span>{user?.fullName || user?.username}</span>
            </Space>
          </Dropdown>
        </Header>
        <Content
          style={{
            margin: '24px',
            padding: '24px',
            background: '#fff',
            borderRadius: 8,
            minHeight: 'calc(100vh - 112px)',
            overflow: 'auto'
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
