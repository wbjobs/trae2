import React, { useState } from 'react'
import { Layout, Menu, Dropdown, Avatar, Space } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  FileTextOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  AuditOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../../store/useAuthStore'
import type { MenuProps } from 'antd'

const { Sider, Header, Content } = Layout

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const menuItems: MenuProps['items'] = [
    {
      key: '/workspace',
      icon: <FileTextOutlined />,
      label: '工作区',
    },
    {
      key: '/audit-logs',
      icon: <AuditOutlined />,
      label: '审计日志',
    },
  ]

  const selectedKey = menuItems?.find((item) =>
    location.pathname.startsWith((item as any)?.key || '')
  ) ? [location.pathname] : ['/workspace']

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ]

  const getBreadcrumbName = () => {
    if (location.pathname.includes('/edit')) return '编辑文档'
    if (location.pathname.includes('/versions')) return '版本历史'
    if (location.pathname.includes('/audit-logs')) return '审计日志'
    return '工作区'
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={240}
        style={{
          background: '#0f172a',
          borderRight: 'none',
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0' : '0 24px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <FileTextOutlined style={{ fontSize: 24, color: '#4da6ff' }} />
          {!collapsed && (
            <span
              style={{
                color: '#fff',
                fontSize: 18,
                fontWeight: 700,
                marginLeft: 12,
                letterSpacing: 1,
              }}
            >
              DocCollab
            </span>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKey}
          items={menuItems}
          onClick={handleMenuClick}
          style={{
            background: 'transparent',
            borderRight: 0,
            marginTop: 8,
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '16px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            overflow: 'hidden',
          }}
        >
          <Avatar
            size={32}
            icon={<UserOutlined />}
            style={{ background: '#4da6ff', flexShrink: 0 }}
          />
          {!collapsed && (
            <div style={{ marginLeft: 12, overflow: 'hidden' }}>
              <div
                style={{
                  color: '#fff',
                  fontSize: 14,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.username || '用户'}
              </div>
              <div
                style={{
                  color: 'rgba(255,255,255,0.45)',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.email || ''}
              </div>
            </div>
          )}
        </div>
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            height: 64,
          }}
        >
          <Space size="middle">
            {React.createElement(
              collapsed ? MenuUnfoldOutlined : MenuFoldOutlined,
              {
                style: { fontSize: 18, cursor: 'pointer', color: '#333' },
                onClick: () => setCollapsed(!collapsed),
              }
            )}
            <span style={{ color: '#666', fontSize: 14 }}>
              {getBreadcrumbName()}
            </span>
          </Space>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar
                size={32}
                icon={<UserOutlined />}
                style={{ background: '#1e3a5f' }}
              />
              <span style={{ color: '#333' }}>{user?.username || '用户'}</span>
            </Space>
          </Dropdown>
        </Header>
        <Content
          style={{
            background: '#f8fafc',
            padding: 24,
            minHeight: 'calc(100vh - 64px)',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout
