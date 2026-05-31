import React, { useState } from 'react'
import { Form, Input, Button, Tabs, Card, message } from 'antd'
import { UserOutlined, LockOutlined, MailOutlined, BankOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../store/useAuthStore'
import type { RegisterRequest } from '../../api/auth'

const Login: React.FC = () => {
  const [activeTab, setActiveTab] = useState('login')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  const [loginForm] = Form.useForm()
  const [registerForm] = Form.useForm()

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true)
    try {
      const res = await authApi.login(values)
      setAuth(res.token, res.user)
      message.success('登录成功')
      navigate('/workspace')
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (values: RegisterRequest & { confirmPassword: string }) => {
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      const { confirmPassword, ...data } = values
      const res = await authApi.register(data)
      setAuth(res.token, res.user)
      message.success('注册成功')
      navigate('/workspace')
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const tabItems = [
    {
      key: 'login',
      label: '登录',
      children: (
        <Form
          form={loginForm}
          onFinish={handleLogin}
          layout="vertical"
          size="large"
          style={{ marginTop: 24 }}
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input
              prefix={<MailOutlined style={{ color: '#b0b8c4' }} />}
              placeholder="邮箱"
            />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#b0b8c4' }} />}
              placeholder="密码"
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 12 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 44,
                background: '#1e3a5f',
                borderRadius: 8,
              }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'register',
      label: '注册',
      children: (
        <Form
          form={registerForm}
          onFinish={handleRegister}
          layout="vertical"
          size="large"
          style={{ marginTop: 24 }}
        >
          <Form.Item
            name="tenantId"
            rules={[{ required: true, message: '请输入租户ID' }]}
          >
            <Input
              prefix={<BankOutlined style={{ color: '#b0b8c4' }} />}
              placeholder="租户ID"
            />
          </Form.Item>
          <Form.Item
            name="tenantName"
            rules={[{ required: true, message: '请输入租户名称' }]}
          >
            <Input
              prefix={<BankOutlined style={{ color: '#b0b8c4' }} />}
              placeholder="租户名称"
            />
          </Form.Item>
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#b0b8c4' }} />}
              placeholder="用户名"
            />
          </Form.Item>
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input
              prefix={<MailOutlined style={{ color: '#b0b8c4' }} />}
              placeholder="邮箱"
            />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#b0b8c4' }} />}
              placeholder="密码"
            />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#b0b8c4' }} />}
              placeholder="确认密码"
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 12 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 44,
                background: '#1e3a5f',
                borderRadius: 8,
              }}
            >
              注册
            </Button>
          </Form.Item>
        </Form>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div
        style={{
          flex: 1,
          background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '48px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -80,
            left: -80,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'rgba(77, 166, 255, 0.08)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -120,
            right: -60,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'rgba(77, 166, 255, 0.05)',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: 'rgba(77, 166, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 32px',
            }}
          >
            <span style={{ fontSize: 40, color: '#4da6ff' }}>📄</span>
          </div>
          <h1
            style={{
              color: '#fff',
              fontSize: 40,
              fontWeight: 700,
              marginBottom: 16,
              letterSpacing: 2,
            }}
          >
            DocCollab
          </h1>
          <p
            style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: 18,
              lineHeight: 1.8,
              maxWidth: 400,
            }}
          >
            高效的文档协作平台
            <br />
            实时编辑 · 版本管理 · 团队协作
          </p>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#f8fafc',
          padding: 24,
        }}
      >
        <Card
          style={{
            width: 440,
            borderRadius: 16,
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            border: 'none',
          }}
          styles={{ body: { padding: '40px 36px 24px' } }}
        >
          <h2
            style={{
              textAlign: 'center',
              marginBottom: 8,
              fontSize: 24,
              fontWeight: 600,
              color: '#1e3a5f',
            }}
          >
            欢迎使用
          </h2>
          <p
            style={{
              textAlign: 'center',
              color: '#999',
              marginBottom: 24,
              fontSize: 14,
            }}
          >
            请登录或注册以开始使用
          </p>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
            centered
            size="large"
          />
        </Card>
      </div>
    </div>
  )
}

export default Login
