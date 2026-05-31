import React from 'react';
import { Layout, Menu, Typography } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  SearchOutlined,
  BarChartOutlined,
  LineChartOutlined,
  BranchesOutlined
} from '@ant-design/icons';

const { Header, Sider } = Layout;
const { Title } = Typography;

interface Props {
  children: React.ReactNode;
}

const MainLayout: React.FC<Props> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '数据总览'
    },
    {
      key: '/query',
      icon: <SearchOutlined />,
      label: '数据查询'
    },
    {
      key: '/analysis',
      icon: <BarChartOutlined />,
      label: '指标分析'
    },
    {
      key: '/visualization',
      icon: <LineChartOutlined />,
      label: '可视化分析'
    },
    {
      key: '/comparison',
      icon: <BranchesOutlined />,
      label: '多站点对比'
    }
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#001529', display: 'flex', alignItems: 'center', padding: '0 24px' }}>
        <Title level={4} style={{ color: '#fff', margin: 0 }}>
          气象探空廓线多要素融合分析可视化系统
        </Title>
      </Header>
      <Layout>
        <Sider width={200} style={{ background: '#fff' }}>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ height: '100%', borderRight: 0 }}
          />
        </Sider>
        {children}
      </Layout>
    </Layout>
  );
};

export default MainLayout;
