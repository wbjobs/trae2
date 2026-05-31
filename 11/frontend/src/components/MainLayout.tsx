import React from 'react'
import { Layout, Menu, theme, Space, Button, Dropdown, Avatar } from 'antd'
import {
  DashboardOutlined,
  LogOutlined,
  ApiOutlined,
  DatabaseOutlined,
  SettingOutlined,
  UserOutlined,
  BellOutlined,
  FullscreenOutlined
} from '@ant-design/icons'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import DashboardPage from '../views/DashboardPage'
import LogViewPage from '../views/LogViewPage'
import TracePage from '../views/TracePage'
import ClusterPage from '../views/ClusterPage'
import DataSourcePage from '../views/DataSourcePage'

const { Header, Sider, Content } = Layout

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表板' },
  { key: '/logs', icon: <LogOutlined />, label: '日志查询' },
  { key: '/trace', icon: <ApiOutlined />, label: '链路追踪' },
  { key: '/cluster', icon: <DatabaseOutlined />, label: '异常聚类' },
  { key: '/sources', icon: <SettingOutlined />, label: '数据源管理' }
]

const MainLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    token: { colorBgContainer }
  } = theme.useToken()

  const userMenu = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: '个人中心' },
      { key: 'settings', icon: <SettingOutlined />, label: '设置' },
      { type: 'divider' as const },
      { key: 'logout', label: '退出登录', danger: true }
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') {
        localStorage.removeItem('auth_token')
        navigate('/login')
      }
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="dark"
        width={200}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'sticky',
          top: 0
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 18,
            fontWeight: 600,
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          <ApiOutlined style={{ marginRight: 8 }} />
          日志溯源平台
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
        <Header
          style={{
            padding: '0 24px',
            background: colorBgContainer,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0'
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 500 }}>
            {menuItems.find((m) => m.key === location.pathname)?.label || '日志溯源平台'}
          </div>
          <Space size="middle">
            <Button type="text" icon={<BellOutlined />} />
            <Button type="text" icon={<FullscreenOutlined />} />
            <Dropdown menu={userMenu} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar icon={<UserOutlined />} />
                <span>管理员</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: 16, padding: 16, background: colorBgContainer, minHeight: 280 }}>
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/logs" element={<LogViewPage />} />
            <Route path="/trace" element={<TracePage />} />
            <Route path="/cluster" element={<ClusterPage />} />
            <Route path="/sources" element={<DataSourcePage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout