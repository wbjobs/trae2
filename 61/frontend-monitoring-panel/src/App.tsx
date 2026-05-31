import React, { useState } from 'react'
import { Layout, Menu, theme } from 'antd'
import {
  DashboardOutlined,
  ThunderboltOutlined,
  AlertOutlined,
  SettingOutlined,
  BarChartOutlined,
} from '@ant-design/icons'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import DeviceControl from './pages/DeviceControl'
import AlertCenter from './pages/AlertCenter'
import SystemConfig from './pages/SystemConfig'
import DataAnalysis from './pages/DataAnalysis'

const { Header, Sider, Content } = Layout

const App: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '监控面板',
    },
    {
      key: '/control',
      icon: <ThunderboltOutlined />,
      label: '设备控制',
    },
    {
      key: '/analysis',
      icon: <BarChartOutlined />,
      label: '数据分析',
    },
    {
      key: '/alerts',
      icon: <AlertOutlined />,
      label: '告警中心',
    },
    {
      key: '/config',
      icon: <SettingOutlined />,
      label: '系统配置',
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        onCollapse={(value) => setCollapsed(value)}
        theme="dark"
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: collapsed ? 14 : 18,
            fontWeight: 'bold',
            background: '#001529',
          }}
        >
          {collapsed ? '配电房' : '智能配电房监控系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: colorBgContainer }}>
          <div style={{ paddingLeft: 24, fontSize: 20, fontWeight: 500 }}>
            智能配电房多维度感知与远程联动控制系统
          </div>
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            overflow: 'auto',
          }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/control" element={<DeviceControl />} />
            <Route path="/analysis" element={<DataAnalysis />} />
            <Route path="/alerts" element={<AlertCenter />} />
            <Route path="/config" element={<SystemConfig />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
