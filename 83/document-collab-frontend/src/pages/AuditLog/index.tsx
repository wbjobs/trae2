import React, { useEffect, useState } from 'react'
import {
  Table,
  Tag,
  Button,
  Space,
  Card,
  Select,
  DatePicker,
  Modal,
  Descriptions,
  Empty,
  message,
  Form,
} from 'antd'
import {
  EyeOutlined,
  SearchOutlined,
  ReloadOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { auditApi, AuditLogDTO, AuditLogQueryParams } from '../../api/audit'
import { authApi, UserDTO } from '../../api/auth'
import dayjs from 'dayjs'
import { useAuthStore } from '../../store/useAuthStore'

const { RangePicker } = DatePicker
const { Option } = Select

const AuditLog: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [modules, setModules] = useState<string[]>([])
  const [users, setUsers] = useState<UserDTO[]>([])
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedLog, setSelectedLog] = useState<AuditLogDTO | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [form] = Form.useForm()
  const { user } = useAuthStore()

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'admin'

  const fetchModules = async () => {
    try {
      const data = await auditApi.getModules()
      setModules(data || [])
    } catch {
    }
  }

  const fetchUsers = async () => {
    try {
      const currentUser = await authApi.getCurrentUser()
      setUsers([currentUser])
    } catch {
    }
  }

  const fetchLogs = async (params?: AuditLogQueryParams) => {
    setLoading(true)
    try {
      const queryParams: AuditLogQueryParams = {
        page,
        size: pageSize,
        ...params,
      }
      const data = await auditApi.getList(queryParams)
      setLogs(data || [])
      setTotal((data || []).length)
    } catch {
      message.error('加载审计日志失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchModules()
    fetchUsers()
    fetchLogs()
  }, [page])

  const handleSearch = (values: any) => {
    const params: AuditLogQueryParams = {
      module: values.module,
      userId: values.userId,
      page: 1,
      size: pageSize,
    }
    if (values.dateRange && values.dateRange.length === 2) {
      params.startTime = values.dateRange[0].startOf('day').format('YYYY-MM-DD HH:mm:ss')
      params.endTime = values.dateRange[1].endOf('day').format('YYYY-MM-DD HH:mm:ss')
    }
    setPage(1)
    fetchLogs(params)
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    fetchLogs()
  }

  const handleViewDetail = async (log: AuditLogDTO) => {
    try {
      const detail = await auditApi.getById(log.id)
      setSelectedLog(detail)
      setDetailModalOpen(true)
    } catch {
      setSelectedLog(log)
      setDetailModalOpen(true)
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const tryParseJson = (str?: string) => {
    if (!str) return null
    try {
      return JSON.stringify(JSON.parse(str), null, 2)
    } catch {
      return str
    }
  }

  const columns: ColumnsType<AuditLogDTO> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (text: string) => (
        <span style={{ color: '#666', fontSize: 12 }}>
          {dayjs(text).format('YYYY-MM-DD HH:mm:ss')}
        </span>
      ),
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      width: 100,
      render: (text: string) => (
        <Tag color="blue" style={{ borderRadius: 4 }}>
          {text}
        </Tag>
      ),
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 100,
      render: (text: string) => (
        <Tag color="purple" style={{ borderRadius: 4 }}>
          {text}
        </Tag>
      ),
    },
    {
      title: '操作',
      dataIndex: 'operation',
      key: 'operation',
      width: 120,
      render: (text: string) => <span style={{ color: '#333' }}>{text}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: 'SUCCESS' | 'FAILURE') => (
        <Tag
          color={status === 'SUCCESS' ? 'success' : 'error'}
          style={{ borderRadius: 4 }}
        >
          {status === 'SUCCESS' ? '成功' : '失败'}
        </Tag>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'durationMs',
      key: 'durationMs',
      width: 80,
      render: (ms: number) => (
        <span style={{ color: ms > 1000 ? '#faad14' : '#666' }}>
          {formatDuration(ms)}
        </span>
      ),
    },
    {
      title: 'IP地址',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      width: 130,
      render: (text: string) => <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#666' }}>{text}</span>,
    },
    {
      title: '详情',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetail(record)}
        >
          查看
        </Button>
      ),
    },
  ]

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Empty
          image={<FileTextOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
          description="您没有权限访问此页面"
        />
      </div>
    )
  }

  return (
    <div>
      <Card
        style={{
          borderRadius: 12,
          marginBottom: 20,
          border: '1px solid #e8ecf1',
        }}
        styles={{ body: { padding: 20 } }}
      >
        <Form
          form={form}
          layout="inline"
          onFinish={handleSearch}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}
        >
          <Form.Item name="module" label="模块">
            <Select
              placeholder="选择模块"
              allowClear
              style={{ width: 150, borderRadius: 6 }}
            >
              {modules.map((m) => (
                <Option key={m} value={m}>
                  {m}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="userId" label="用户">
            <Select
              placeholder="选择用户"
              allowClear
              style={{ width: 150, borderRadius: 6 }}
            >
              {users.map((u) => (
                <Option key={u.id} value={u.id}>
                  {u.username}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="dateRange" label="时间范围">
            <RangePicker
              showTime
              style={{ width: 280, borderRadius: 6 }}
              format="YYYY-MM-DD HH:mm"
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SearchOutlined />}
                style={{ background: '#1e3a5f', borderRadius: 6 }}
              >
                查询
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleReset}
                style={{ borderRadius: 6 }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card
        style={{
          borderRadius: 12,
          border: '1px solid #e8ecf1',
        }}
        styles={{ body: { padding: 0 } }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1e3a5f' }}>
            审计日志
          </span>
          <span style={{ color: '#999', fontSize: 12 }}>
            共 {total} 条记录
          </span>
        </div>
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (p) => setPage(p),
          }}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty description="暂无审计日志" style={{ padding: '40px 0' }} /> }}
          style={{ borderRadius: 12 }}
        />
      </Card>

      <Modal
        title="日志详情"
        open={detailModalOpen}
        onCancel={() => {
          setDetailModalOpen(false)
          setSelectedLog(null)
        }}
        footer={null}
        centered
        width={800}
        styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
      >
        {selectedLog && (
          <div>
            <Descriptions
              bordered
              column={2}
              size="small"
              labelStyle={{ background: '#fafafa', color: '#666', width: 120 }}
              style={{ marginBottom: 16 }}
            >
              <Descriptions.Item label="操作时间">
                {dayjs(selectedLog.createdAt).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label="操作用户">
                <Tag color="blue" style={{ borderRadius: 4 }}>
                  {selectedLog.username}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="模块">
                <Tag color="purple" style={{ borderRadius: 4 }}>
                  {selectedLog.module}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="操作">
                {selectedLog.operation}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag
                  color={selectedLog.status === 'SUCCESS' ? 'success' : 'error'}
                  style={{ borderRadius: 4 }}
                >
                  {selectedLog.status === 'SUCCESS' ? '成功' : '失败'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="耗时">
                {formatDuration(selectedLog.durationMs)}
              </Descriptions.Item>
              <Descriptions.Item label="IP地址">
                <span style={{ fontFamily: 'monospace' }}>{selectedLog.ipAddress}</span>
              </Descriptions.Item>
              <Descriptions.Item label="请求方法">
                <Tag color="cyan" style={{ borderRadius: 4 }}>
                  {selectedLog.requestMethod}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="请求路径" span={2}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#666' }}>
                  {selectedLog.requestUri}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="用户代理" span={2}>
                <span style={{ fontSize: 11, color: '#999' }}>{selectedLog.userAgent}</span>
              </Descriptions.Item>
            </Descriptions>

            {selectedLog.params && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: '#666', fontSize: 12, marginBottom: 8, fontWeight: 500 }}>
                  请求参数
                </div>
                <pre
                  style={{
                    background: '#f6f8fa',
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 12,
                    overflow: 'auto',
                    maxHeight: 150,
                    border: '1px solid #e8ecf1',
                  }}
                >
                  {tryParseJson(selectedLog.params)}
                </pre>
              </div>
            )}

            {selectedLog.result && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: '#666', fontSize: 12, marginBottom: 8, fontWeight: 500 }}>
                  返回结果
                </div>
                <pre
                  style={{
                    background: '#f6f8fa',
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 12,
                    overflow: 'auto',
                    maxHeight: 150,
                    border: '1px solid #e8ecf1',
                  }}
                >
                  {tryParseJson(selectedLog.result)}
                </pre>
              </div>
            )}

            {selectedLog.errorMessage && (
              <div>
                <div style={{ color: '#666', fontSize: 12, marginBottom: 8, fontWeight: 500 }}>
                  错误信息
                </div>
                <div
                  style={{
                    background: '#fff2f0',
                    padding: 12,
                    borderRadius: 6,
                    color: '#ff4d4f',
                    fontSize: 12,
                    border: '1px solid #ffccc7',
                  }}
                >
                  {selectedLog.errorMessage}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default AuditLog
