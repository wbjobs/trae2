import React, { useEffect } from 'react'
import { Card, Table, Button, Space, Tag, Modal, Form, Input, Select, Switch, message, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, ApiOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { DataSource } from '../types'
import { useAppStore } from '../store'
import { sourceApi } from '../api'

const DataSourcePage: React.FC = () => {
  const { dataSources, setDataSources } = useAppStore()
  const [modalOpen, setModalOpen] = React.useState(false)
  const [editingSource, setEditingSource] = React.useState<DataSource | null>(null)
  const [form] = Form.useForm()

  const fetchSources = async () => {
    try {
      const res = await sourceApi.getDataSources()
      setDataSources(res.data || [])
    } catch (error) {
      console.error('Fetch sources failed:', error)
    }
  }

  useEffect(() => {
    fetchSources()
  }, [])

  const handleAdd = () => {
    setEditingSource(null)
    form.resetFields()
    setModalOpen(true)
  }

  const handleEdit = (record: DataSource) => {
    setEditingSource(record)
    form.setFieldsValue(record)
    setModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await sourceApi.deleteDataSource(id)
      message.success('删除成功')
      fetchSources()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleTest = async (id: string) => {
    try {
      const res = await sourceApi.testConnection(id)
      if (res.data.success) {
        message.success('连接测试成功')
      } else {
        message.error(`连接失败: ${res.data.message}`)
      }
    } catch (error) {
      message.error('连接测试失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingSource) {
        await sourceApi.updateDataSource(editingSource.id, values)
        message.success('更新成功')
      } else {
        await sourceApi.createDataSource(values)
        message.success('创建成功')
      }
      setModalOpen(false)
      fetchSources()
    } catch (error) {
      console.error('Submit failed:', error)
    }
  }

  const columns: ColumnsType<DataSource> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text) => (
        <Space>
          <ApiOutlined />
          {text}
        </Space>
      )
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type) => {
        const typeMap: Record<string, { color: string; label: string }> = {
          file: { color: 'blue', label: '文件' },
          database: { color: 'green', label: '数据库' },
          api: { color: 'orange', label: 'API' },
          syslog: { color: 'purple', label: 'Syslog' }
        }
        const config = typeMap[type] || { color: 'default', label: type }
        return <Tag color={config.color}>{config.label}</Tag>
      }
    },
    {
      title: '连接状态',
      dataIndex: 'connected',
      key: 'connected',
      render: (connected) => (
        <Tag color={connected ? 'green' : 'red'}>
          {connected ? '已连接' : '未连接'}
        </Tag>
      )
    },
    {
      title: '最后同步',
      dataIndex: 'lastSync',
      key: 'lastSync',
      render: (time) => time || '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<SyncOutlined />}
            onClick={() => handleTest(record.id)}
          >
            测试
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <Card
      title="数据源管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加数据源
        </Button>
      }
    >
      <Table
        columns={columns}
        dataSource={dataSources}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />
      <Modal
        title={editingSource ? '编辑数据源' : '添加数据源'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="请输入数据源名称" />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'file', label: '文件日志' },
                { value: 'database', label: '数据库' },
                { value: 'api', label: 'API 接口' },
                { value: 'syslog', label: 'Syslog' }
              ]}
            />
          </Form.Item>
          <Form.Item name={['config', 'path']} label="路径/地址">
            <Input placeholder="文件路径或API地址" />
          </Form.Item>
          <Form.Item name={['config', 'host']} label="主机">
            <Input placeholder="主机地址" />
          </Form.Item>
          <Form.Item name={['config', 'port']} label="端口">
            <Input placeholder="端口号" />
          </Form.Item>
          <Form.Item name={['config', 'username']} label="用户名">
            <Input />
          </Form.Item>
          <Form.Item name={['config', 'password']} label="密码">
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

export default DataSourcePage