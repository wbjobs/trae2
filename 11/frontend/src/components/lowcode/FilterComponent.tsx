import React from 'react'
import { Card, Select, DatePicker, Input, Button, Space, Tag } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import type { LogFilter } from '../../types'
import { useAppStore } from '../../store'
import { logApi } from '../../api'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

export const FilterComponent: React.FC = () => {
  const { currentFilter, setCurrentFilter, resetLogs, setLogsPage } = useAppStore()

  const handleSearch = () => {
    setLogsPage(1)
    resetLogs()
  }

  const handleReset = () => {
    setCurrentFilter({
      level: [],
      os: [],
      startTime: '',
      endTime: '',
      keyword: '',
      service: undefined,
      node: undefined,
      traceId: undefined,
      tags: [],
      page: 1,
      pageSize: 20
    })
    setLogsPage(1)
    resetLogs()
  }

  const handleDateChange = (dates: any) => {
    if (dates && dates.length === 2) {
      setCurrentFilter({
        startTime: dates[0]?.toISOString() || '',
        endTime: dates[1]?.toISOString() || ''
      })
    } else {
      setCurrentFilter({ startTime: '', endTime: '' })
    }
  }

  return (
    <Card
      title="日志筛选"
      size="small"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
        </Space>
      }
      style={{ height: '100%' }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Input
          placeholder="Trace ID 追踪"
          value={currentFilter.traceId}
          onChange={(e) => setCurrentFilter({ traceId: e.target.value })}
          allowClear
        />
        <Input
          placeholder="关键词搜索"
          value={currentFilter.keyword}
          onChange={(e) => setCurrentFilter({ keyword: e.target.value })}
          allowClear
          onPressEnter={handleSearch}
        />
        <Space>
          <Select
            mode="multiple"
            placeholder="日志级别"
            value={currentFilter.level}
            onChange={(value) => setCurrentFilter({ level: value })}
            style={{ minWidth: 150 }}
            options={[
              { value: 'DEBUG', label: <Tag color="default">DEBUG</Tag> },
              { value: 'INFO', label: <Tag color="blue">INFO</Tag> },
              { value: 'WARN', label: <Tag color="orange">WARN</Tag> },
              { value: 'ERROR', label: <Tag color="red">ERROR</Tag> },
              { value: 'FATAL', label: <Tag color="magenta">FATAL</Tag> }
            ]}
          />
          <Select
            mode="multiple"
            placeholder="操作系统"
            value={currentFilter.os}
            onChange={(value) => setCurrentFilter({ os: value })}
            style={{ minWidth: 130 }}
            options={[
              { value: 'Linux', label: 'Linux' },
              { value: 'Windows', label: 'Windows' }
            ]}
          />
        </Space>
        <Select
          placeholder="服务名称"
          value={currentFilter.service}
          onChange={(value) => setCurrentFilter({ service: value })}
          allowClear
          style={{ width: '100%' }}
          options={[
            { value: 'gateway-service', label: '网关服务' },
            { value: 'log-collector', label: '日志采集' },
            { value: 'storage-service', label: '存储服务' },
            { value: 'auth-service', label: '认证服务' }
          ]}
        />
        <Select
          placeholder="节点名称"
          value={currentFilter.node}
          onChange={(value) => setCurrentFilter({ node: value })}
          allowClear
          style={{ width: '100%' }}
          options={[
            { value: 'node-01', label: '节点 01' },
            { value: 'node-02', label: '节点 02' },
            { value: 'node-03', label: '节点 03' }
          ]}
        />
        <RangePicker
          showTime
          style={{ width: '100%' }}
          onChange={handleDateChange}
          value={
            currentFilter.startTime && currentFilter.endTime
              ? [dayjs(currentFilter.startTime), dayjs(currentFilter.endTime)]
              : null
          }
        />
      </Space>
    </Card>
  )
}
