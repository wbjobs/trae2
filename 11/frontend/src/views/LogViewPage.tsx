import React, { useEffect, useCallback, useRef } from 'react'
import { Row, Col, Card, Drawer, Descriptions, Tag, Button, Space, Typography, Alert, Statistic } from 'antd'
import { CloseOutlined, ReloadOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { FilterComponent } from '../components/lowcode/FilterComponent'
import { TableComponent } from '../components/lowcode/TableComponent'
import { ChartComponent } from '../components/lowcode/ChartComponent'
import { useAppStore } from '../store'
import { logApi } from '../api'
import dayjs from 'dayjs'

const { Title, Text } = Typography

const LogViewPage: React.FC = () => {
  const {
    currentLog,
    setCurrentLog,
    setLogs,
    setLogsLoading,
    setStats,
    currentFilter,
    logsPage,
    logsPageSize,
    logsTotal,
    logsTook,
    resetLogs
  } = useAppStore()

  const fetchData = useCallback(async () => {
    setLogsLoading(true)
    try {
      const [logsRes, statsRes] = await Promise.all([
        logApi.queryLogs({
          ...currentFilter,
          page: logsPage,
          pageSize: logsPageSize
        }),
        logApi.getLogStats(currentFilter)
      ])

      setLogs(
        logsRes.data.data || [],
        logsRes.data.total || 0,
        logsRes.data.hasMore || false,
        logsRes.data.took
      )
      setStats(statsRes.data.data || {})
    } catch (error) {
      console.error('Fetch data failed:', error)
    } finally {
      setLogsLoading(false)
    }
  }, [currentFilter, logsPage, logsPageSize, setLogs, setLogsLoading, setStats])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    resetLogs()
  }, [currentFilter.keyword, currentFilter.level, currentFilter.service, currentFilter.node, currentFilter.os, currentFilter.startTime, currentFilter.endTime])

  return (
    <div>
      <Row gutter={16}>
        <Col span={6}>
          <FilterComponent />
        </Col>
        <Col span={18}>
          {logsTook !== undefined && (
            <Card style={{ marginBottom: 16, padding: '12px 16px' }}>
              <Space>
                <Statistic
                  title="查询耗时"
                  value={logsTook}
                  suffix="ms"
                  prefix={<ClockCircleOutlined />}
                  valueStyle={{ fontSize: 16 }}
                />
                <Statistic
                  title="匹配日志"
                  value={logsTotal}
                  suffix="条"
                  valueStyle={{ fontSize: 16 }}
                />
                <Button
                  icon={<ReloadOutlined />}
                  onClick={fetchData}
                  style={{ marginLeft: 16 }}
                >
                  刷新
                </Button>
              </Space>
            </Card>
          )}
          <Card style={{ marginBottom: 16 }}>
            <ChartComponent />
          </Card>
          <Card title="日志列表" style={{ marginBottom: 16 }}>
            <TableComponent />
          </Card>
        </Col>
      </Row>
      <Drawer
        title="日志详情"
        placement="right"
        width={600}
        open={!!currentLog}
        onClose={() => setCurrentLog(null)}
        extra={
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => setCurrentLog(null)}
          />
        }
      >
        {currentLog && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="日志ID">{currentLog.id}</Descriptions.Item>
            <Descriptions.Item label="Trace ID">
              <Tag color="blue">{currentLog.traceId}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Span ID">{currentLog.spanId}</Descriptions.Item>
            {currentLog.parentSpanId && (
              <Descriptions.Item label="Parent Span ID">{currentLog.parentSpanId}</Descriptions.Item>
            )}
            <Descriptions.Item label="时间">
              {dayjs(currentLog.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS')}
            </Descriptions.Item>
            <Descriptions.Item label="级别">
              <Tag
                color={
                  currentLog.level === 'ERROR' || currentLog.level === 'FATAL'
                    ? 'red'
                    : currentLog.level === 'WARN'
                    ? 'orange'
                    : currentLog.level === 'INFO'
                    ? 'blue'
                    : 'default'
                }
              >
                {currentLog.level}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="服务">{currentLog.service}</Descriptions.Item>
            <Descriptions.Item label="节点">{currentLog.node}</Descriptions.Item>
            <Descriptions.Item label="操作系统">
              <Tag color={currentLog.os === 'Linux' ? 'geekblue' : 'green'}>
                {currentLog.os}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="日志内容">
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 13,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: 200,
                  overflowY: 'auto',
                  padding: 8,
                  background: '#f5f5f5',
                  borderRadius: 4
                }}
              >
                {currentLog.message}
              </div>
            </Descriptions.Item>
            {currentLog.stackTrace && (
              <Descriptions.Item label="堆栈信息">
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: 300,
                    overflowY: 'auto',
                    padding: 8,
                    background: '#fff7f7',
                    borderRadius: 4,
                    border: '1px solid #ffccc7'
                  }}
                >
                  {currentLog.stackTrace}
                </div>
              </Descriptions.Item>
            )}
            {currentLog.tags && currentLog.tags.length > 0 && (
              <Descriptions.Item label="标签">
                <Space>
                  {currentLog.tags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </Space>
              </Descriptions.Item>
            )}
            {currentLog.metadata && Object.keys(currentLog.metadata).length > 0 && (
              <Descriptions.Item label="元数据">
                <pre
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    background: '#fafafa',
                    padding: 8,
                    borderRadius: 4,
                    maxHeight: 200,
                    overflow: 'auto'
                  }}
                >
                  {JSON.stringify(currentLog.metadata, null, 2)}
                </pre>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Drawer>
    </div>
  )
}

export default LogViewPage
