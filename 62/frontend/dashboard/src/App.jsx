import React, { useState, useEffect } from 'react';
import { Layout, Menu, ConfigProvider } from 'antd';
import {
  DashboardOutlined,
  ApiOutlined,
  LinkOutlined,
  ClusterOutlined,
  FileTextOutlined,
  SettingOutlined,
  ReloadOutlined,
  HistoryOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import Overview from './components/Overview.jsx';
import SignalingMonitor from './components/SignalingMonitor.jsx';
import LinkAnalysis from './components/LinkAnalysis.jsx';
import NodeSync from './components/NodeSync.jsx';
import AuditLog from './components/AuditLog.jsx';
import RuleManagement from './components/RuleManagement.jsx';
import FaultReplay from './components/FaultReplay.jsx';
import AuditLogEnhanced from './components/AuditLogEnhanced.jsx';
import SignalingPerformance from './components/SignalingPerformance.jsx';
import { useWebSocket } from './hooks/useWebSocket.js';

const { Header, Content, Sider } = Layout;

const MENU_ITEMS = [
  { key: 'overview', label: '态势总览', icon: <DashboardOutlined /> },
  { key: 'signaling', label: '信令监控', icon: <ApiOutlined /> },
  {
    key: 'signaling-performance',
    label: '信令性能',
    icon: <ThunderboltOutlined />,
  },
  { key: 'links', label: '链路分析', icon: <LinkOutlined /> },
  {
    key: 'fault-replay',
    label: '故障回放',
    icon: <HistoryOutlined />,
  },
  { key: 'nodes', label: '节点同步', icon: <ClusterOutlined /> },
  { key: 'rules', label: '规则管理', icon: <SettingOutlined /> },
  { key: 'audit', label: '操作审计', icon: <FileTextOutlined /> },
  {
    key: 'audit-enhanced',
    label: '审计增强',
    icon: <DownloadOutlined />,
  },
];

const WS_URL = 'ws://localhost:3002/ws';

export default function App() {
  const [currentKey, setCurrentKey] = useState('overview');
  const [wsConnected, setWsConnected] = useState(false);
  const [wsMessages, setWsMessages] = useState([]);

  useWebSocket(WS_URL, {
    onOpen: () => setWsConnected(true),
    onClose: () => setWsConnected(false),
    onMessage: (data) => {
      setWsMessages(prev => [...prev.slice(-49), data]);
    },
    autoReconnect: true,
    reconnectInterval: 5000,
  });

  const handleMenuClick = ({ key }) => {
    setCurrentKey(key);
  };

  const renderContent = () => {
    switch (currentKey) {
      case 'overview':
        return <Overview wsMessages={wsMessages} />;
      case 'signaling':
        return <SignalingMonitor wsMessages={wsMessages} />;
      case 'signaling-performance':
        return <SignalingPerformance />;
      case 'links':
        return <LinkAnalysis wsMessages={wsMessages} />;
      case 'fault-replay':
        return <FaultReplay />;
      case 'nodes':
        return <NodeSync wsMessages={wsMessages} />;
      case 'rules':
        return <RuleManagement />;
      case 'audit':
        return <AuditLog />;
      case 'audit-enhanced':
        return <AuditLogEnhanced />;
      default:
        return <Overview wsMessages={wsMessages} />;
    }
  };

  return (
    <Layout className="app-layout">
      <Header className="app-header">
        <h1>地铁弱电系统信令采集与全网状态监控系统</h1>
        <div className="header-info">
          {wsConnected ? (
            <span style={{ color: '#52c41a' }}>● WebSocket 已连接</span>
          ) : (
            <span style={{ color: '#ff4d4f' }}>● WebSocket 未连接</span>
          )}
          <span style={{ marginLeft: 16 }}>
            {new Date().toLocaleString('zh-CN')}
          </span>
        </div>
      </Header>
      <Layout>
        <Sider
          width={180}
          style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}
          theme="light"
        >
          <Menu
            mode="inline"
            selectedKeys={[currentKey]}
            onClick={handleMenuClick}
            items={MENU_ITEMS}
            style={{ height: '100%', borderRight: 0 }}
          />
        </Sider>
        <Content className="app-content">{renderContent()}</Content>
      </Layout>
    </Layout>
  );
}
