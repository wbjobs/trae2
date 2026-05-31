import React, { useState, useEffect } from 'react';
import { Layout, Menu, theme, Badge } from 'antd';
import {
  DashboardOutlined,
  ApartmentOutlined,
  BarChartOutlined,
  AlertOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  ToolOutlined
} from '@ant-design/icons';
import Dashboard from './pages/Dashboard';
import Topology from './pages/Topology';
import DataAnalysis from './pages/DataAnalysis';
import Alerts from './pages/Alerts';
import RemoteControl from './pages/RemoteControl';
import EnergyPrediction from './pages/EnergyPrediction';
import WorkOrders from './pages/WorkOrders';

const { Header, Sider, Content } = Layout;

const App: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState('1');
  const [alertCount, setAlertCount] = useState(0);
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8003/ws');
    ws.onmessage = (event) => {
      setAlertCount(prev => prev + 1);
    };
    return () => ws.close();
  }, []);

  const menuItems = [
    {
      key: '1',
      icon: <DashboardOutlined />,
      label: '总览面板',
    },
    {
      key: '2',
      icon: <ApartmentOutlined />,
      label: '设备拓扑',
    },
    {
      key: '3',
      icon: <BarChartOutlined />,
      label: '数据分析',
    },
    {
      key: '4',
      icon: <Badge count={alertCount}><AlertOutlined /></Badge>,
      label: '告警中心',
    },
    {
      key: '5',
      icon: <ThunderboltOutlined />,
      label: '远程运维',
    },
    {
      key: '6',
      icon: <BulbOutlined />,
      label: '发电量预估',
    },
    {
      key: '7',
      icon: <ToolOutlined />,
      label: '运维工单',
    },
  ];

  const renderContent = () => {
    switch (selectedKey) {
      case '1':
        return <Dashboard />;
      case '2':
        return <Topology />;
      case '3':
        return <DataAnalysis />;
      case '4':
        return <Alerts />;
      case '5':
        return <RemoteControl />;
      case '6':
        return <EnergyPrediction />;
      case '7':
        return <WorkOrders />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)}>
        <div className="logo">
          {collapsed ? 'PV' : '光伏监测系统'}
        </div>
        <Menu
          theme="dark"
          selectedKeys={[selectedKey]}
          mode="inline"
          items={menuItems}
          onClick={({ key }) => setSelectedKey(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: colorBgContainer }}>
          <div style={{ padding: '0 24px', fontSize: '20px', fontWeight: 'bold' }}>
            {menuItems.find(item => item.key === selectedKey)?.label as string}
          </div>
        </Header>
        <Content style={{ margin: '24px 16px', padding: 24, minHeight: 280, background: colorBgContainer }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
