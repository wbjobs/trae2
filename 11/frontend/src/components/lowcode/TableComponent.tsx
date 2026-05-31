import React, { useMemo } from 'react'
import { Table, Tag, Space, Typography, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { LogEntry } from '../../types'
import { useAppStore } from '../../store'
import dayjs from 'dayjs'
import { WarningOutlined } from '@ant-design/icons'

const { Text } = Typography

const levelColorMap: Record<string, string> = {
  DEBUG: 'default',
  INFO: 'blue',
  WARN: 'orange',
  ERROR: 'red',
  FATAL: 'magenta'
}

const statusIcons: Record<string, React.ReactNode> = {
  ERROR: <WarningOutlined style={{ color: '#ff4d4f' } />
}

export const TableComponent: React.FC = () => {
  const {
    logs,
    logsLoading,
    logsTotal,
    logsPage,
    logsPageSize,
    logsTook,
    setCurrentLog,
    setLogsPage,
    setLogsPageSize
  } = useAppStore()

  const columns: ColumnsType<LogEntry> = useMemo(() => [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 170,
      fixed: 'left',
      render: (time: string) => dayjs(time).format('MM-DD HH:mm:ss.SSS')
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 70,
      render: (level: string) => (
        <Tag color={levelColorMap[level]} style={{ margin: 0 }}>
          {statusIcons[level] || null} {level}
        </Tag>
      )
    },
    {
      title: 'Trace ID',
      dataIndex: 'traceId',
      key: 'traceId',
      width: 140,
      render: (id: string) => (
        <Tooltip title={id}>
          <Text copyable={{ text: id, tooltips: ['复制', '已复制'] }} style={{ fontSize: 12 }}>
            {id.slice(0, 12)}...
          </Text>
        </Tooltip>
      )
    },
    {
      title: '服务',
      dataIndex: 'service',
      key: 'traceId',
      width: 120
    },
    {
      title: '节点',
      dataIndex: 'node',
      key: 'node',
      width: 80
    },
    {
      title: '系统',
      dataIndex: 'os',
      key: 'os',
      width: 70,
      render: (os: string) => (
        <Tag color={os === 'Linux' ? 'geekblue' : 'green'}>{os}</Tag>
      )
    },
    {
      title: '日志内容',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
      render: (msg: string) => (
        <Tooltip title={msg} placement="topLeft" overlayInnerStyle={{ maxWidth: 600 }}>
          <Text style={{ fontSize: 13 }}>{msg}</Text>
        </Tooltip>
      )
    }
  ], [])

  const handleTableChange = (pagination: any) => {
    if (pagination.current !== logsPage) {
      setLogsPage(pagination.current)
    }
    if (pagination.pageSize !== logsPageSize) {
      setLogsPageSize(pagination.pageSize)
    }
  }

  return (
    <div>
      <Table<LogEntry>
        columns={columns}
        dataSource={logs}
        rowKey="id"
        loading={logsLoading}
        size="small"
        scroll={{ x: 900, y: 350 }}
        pagination={{
          current: logsPage,
          pageSize: logsPageSize,
          total: logsTotal,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条${logsTook ? ` · 耗时 ${logsTook}ms` : ''}
        }}
        onChange={handleTableChange}
        onRow={(record) => ({
          onClick: () => setCurrentLog(record),
          style: { cursor: 'pointer' }
        })}
      />
    </div>
  )
}
