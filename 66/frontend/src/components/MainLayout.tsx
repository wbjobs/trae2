import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  EnvironmentOutlined,
  LineChartOutlined,
  AppstoreOutlined,
  PictureOutlined,
  BarChartOutlined,
  GlobalOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';

const { Header, Sider } = Layout;

interface MainLayoutProps {
  children: ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '数据看板'
    },
    {
      key: '/resources',
      icon: <EnvironmentOutlined />,
      label: '种质资源'
    },
    {
      key: '/growth',
      icon: <LineChartOutlined />,
      label: '生长记录',
      children: [
        {
          key: '/growth',
          icon: <LineChartOutlined />,
          label: '记录管理'
        },
        {
          key: '/growth/analysis',
          icon: <BarChartOutlined />,
          label: '年度对比分析'
        }
      ]
    },
    {
      key: '/distribution',
      icon: <GlobalOutlined />,
      label: '资源分布'
    },
    {
      key: '/categories',
      icon: <AppstoreOutlined />,
      label: '分类管理'
    },
    {
      key: '/images',
      icon: <PictureOutlined />,
      label: '野外影像'
    }
  ];

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path.startsWith('/resources')) return '/resources';
    if (path.startsWith('/growth/analysis')) return '/growth/analysis';
    if (path.startsWith('/growth')) return '/growth';
    if (path.startsWith('/distribution')) return '/distribution';
    if (path.startsWith('/categories')) return '/categories';
    if (path.startsWith('/images')) return '/images';
    return '/';
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px' }}>
        <h1 style={{ color: 'white', margin: 0, fontSize: 20, fontWeight: 600 }}>
          🌲 林木种质资源调查与生长监测平台
        </h1>
      </Header>
      <Layout>
        <Sider width={200} theme="light">
          <Menu
            mode="inline"
            selectedKeys={[getSelectedKey()]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ height: '100%', borderRight: 0, paddingTop: 16 }}
          />
        </Sider>
        <Layout style={{ background: '#f5f7f5' }}>
          {children}
        </Layout>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
