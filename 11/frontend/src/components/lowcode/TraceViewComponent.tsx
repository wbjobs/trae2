import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, Input, Button, Space, Empty, Tag, Alert, Table, Typography, List, Timeline, Tabs } from 'antd'
import { SearchOutlined, ReloadOutlined, WarningOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import * as d3 from 'd3'
import type { TraceLink, TraceNode } from '../../types'
import { useAppStore } from '../../store'
import { traceApi } from '../../api'
import dayjs from 'dayjs'

const { Text, Title } = Typography

const statusColors: Record<string, string> = {
  success: '#52c41a',
  error: '#ff4d4f',
  pending: '#faad14',
  timeout: '#fa8c16',
  broken: '#eb2f96'
}

const statusLabels: Record<string, string> = {
  success: '正常',
  error: '错误',
  pending: '处理中',
  timeout: '超时',
  broken: '断裂'
}

const statusIcons: Record<string, React.ReactNode> = {
  success: <CheckCircleOutlined />,
  error: <CloseCircleOutlined />,
  pending: <ClockCircleOutlined />,
  timeout: <ClockCircleOutlined />,
  broken: <WarningOutlined />
}

export const TraceViewComponent: React.FC = () => {
  const [traceIdInput, setTraceIdInput] = React.useState('')
  const [selectedTab, setSelectedTab] = useState<'graph' | 'timeline' | 'stats' | 'breakpoints'>('graph')
  const { traceResult, setTraceResult, traceLoading, setTraceLoading } = useAppStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleSearch = async () => {
    if (!traceIdInput.trim()) return
    setTraceLoading(true)
    try {
      const res = await traceApi.getTraceByTraceId(traceIdInput.trim())
      setTraceResult(res.data.data)
    } catch (error) {
      console.error('Get trace failed:', error)
      setTraceResult(null)
    } finally {
      setTraceLoading(false)
    }
  }

  const traceGraphData = useMemo(() => {
    if (!traceResult) return { nodes: [], links: [] }
    const nodeMap = new Map<string, any>()
    traceResult.nodes.forEach((node, index) => {
      nodeMap.set(node.spanId, {
        id: node.spanId,
        name: node.service,
        status: node.status,
        duration: node.duration,
        selfTime: node.selfTime,
        timestamp: node.timestamp,
        isBreakpoint: node.isBreakpoint,
        breakpointReason: node.breakpointReason,
        childrenCount: node.childrenCount,
        index
      })
    })
    const links = traceResult.edges.map((edge) => ({
      source: edge.from,
      target: edge.to,
      duration: edge.duration,
      networkLatency: edge.networkLatency
    }))
    return {
      nodes: Array.from(nodeMap.values()),
      links
    }
  }, [traceResult])

  useEffect(() => {
    if (!svgRef.current || !traceResult) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = containerRef.current?.clientWidth || 600
    const height = 400
    svg.attr('width', width).attr('height', height)

    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom)

    const criticalPathSet = new Set(traceResult.criticalPath || [])

    const simulation = d3.forceSimulation(traceGraphData.nodes as any)
      .force('link', d3.forceLink(traceGraphData.links as any)
        .id((d: any) => d.id)
        .distance(120))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(35))

    const link = g.append('g')
      .selectAll('line')
      .data(traceGraphData.links)
      .join('line')
      .attr('stroke', (d: any) => {
        const source = d.source
        const target = d.target
        if (criticalPathSet.has(source.id || source) && criticalPathSet.has(target.id || target)) {
          return '#1890ff'
        }
        return '#999'
      })
      .attr('stroke-opacity', 0.8)
      .attr('stroke-width', (d: any) => {
        const source = d.source
        const target = d.target
        if (criticalPathSet.has(source.id || source) && criticalPathSet.has(target.id || target)) {
          return 3
        }
        return 2
      })

    const linkLabel = g.append('g')
      .selectAll('text')
      .data(traceGraphData.links)
      .join('text')
      .text((d: any) => `${d.duration}ms${d.networkLatency ? ` (网${d.networkLatency}ms)` : ''}`)
      .attr('font-size', 10)
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')

    const node = g.append('g')
      .selectAll('g')
      .data(traceGraphData.nodes)
      .join('g')
      .call(d3.drag<SVGGElement, any>()
        .on('start', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d: any) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        }))

    node.append('circle')
      .attr('r', (d: any) => d.isBreakpoint ? 24 : 18)
      .attr('fill', (d: any) => statusColors[d.status as keyof typeof statusColors] || '#1890ff')
      .attr('stroke', (d: any) => criticalPathSet.has(d.id) ? '#1890ff' : '#fff')
      .attr('stroke-width', (d: any) => criticalPathSet.has(d.id) ? 3 : 2)

    node.filter((d: any) => d.isBreakpoint)
      .append('circle')
      .attr('r', 30)
      .attr('fill', 'none')
      .attr('stroke', '#ff4d4f')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,4')

    node.append('text')
      .text((d: any) => d.name.slice(0, 6))
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('font-size', 10)
      .attr('fill', '#fff')
      .attr('font-weight', (d: any) => criticalPathSet.has(d.id) ? 'bold' : 'normal')

    node.append('title')
      .text((d: any) => {
        let title = `${d.name}\n耗时: ${d.duration}ms`
        if (d.selfTime !== undefined) title += `\n自耗时: ${d.selfTime}ms`
        if (d.childrenCount !== undefined) title += `\n子节点数: ${d.childrenCount}`
        title += `\n状态: ${statusLabels[d.status] || d.status}`
        if (d.isBreakpoint) title += `\n⚠️ 断点: ${d.breakpointReason || '未知原因'}`
        if (criticalPathSet.has(d.id)) title += `\n⚡ 关键路径节点`
        title += `\n时间: ${dayjs(d.timestamp).format('HH:mm:ss.SSS')}`
        return title
      })

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      linkLabel
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2)

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    return () => {
      simulation.stop()
    }
  }, [traceResult, traceGraphData])

  const statusTagColor = traceResult ? statusColors[traceResult.status] || 'default' : 'default'

  const serviceStatsColumns = [
    {
      title: '服务',
      dataIndex: 'service',
      key: 'service',
      width: 150,
      render: (service: string) => <Tag color="blue">{service}</Tag>
    },
    {
      title: '调用次数',
      dataIndex: 'callCount',
      key: 'callCount',
      width: 90
    },
    {
      title: '错误次数',
      dataIndex: 'errorCount',
      key: 'errorCount',
      width: 90,
      render: (count: number) => (
        <Text type={count > 0 ? 'danger' : undefined}>{count}</Text>
      )
    },
    {
      title: '总耗时(ms)',
      dataIndex: 'totalDuration',
      key: 'totalDuration',
      width: 110
    },
    {
      title: '平均耗时(ms)',
      dataIndex: 'avgDuration',
      key: 'avgDuration',
      width: 110
    },
    {
      title: '最大耗时(ms)',
      dataIndex: 'maxDuration',
      key: 'maxDuration',
      width: 110
    },
    {
      title: '最小耗时(ms)',
      dataIndex: 'minDuration',
      key: 'minDuration',
      width: 110
    }
  ]

  return (
    <Card
      title="链路溯源分析"
      size="small"
      extra={
        <Space>
          <Input
            placeholder="输入 Trace ID"
            value={traceIdInput}
            onChange={(e) => setTraceIdInput(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 200 }}
            size="small"
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            size="small"
            onClick={handleSearch}
            loading={traceLoading}
          >
            追踪
          </Button>
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={() => {
              setTraceIdInput('')
              setTraceResult(null)
            }}
          >
            清空
          </Button>
        </Space>
      }
      style={{ height: '100%' }}
    >
      {traceResult ? (
        <div>
          <Space size="middle" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <Tag color="blue">总耗时: {traceResult.totalDuration}ms</Tag>
            <Tag color={statusTagColor}>
              {statusIcons[traceResult.status]} 状态: {statusLabels[traceResult.status] || traceResult.status}
            </Tag>
            <Tag>节点数: {traceResult.nodes.length}</Tag>
            <Tag>调用链: {traceResult.edges.length}</Tag>
            {traceResult.breakpoints && traceResult.breakpoints.length > 0 && (
              <Tag color="red">
                <WarningOutlined /> 断点: {traceResult.breakpoints.length}
              </Tag>
            )}
            {traceResult.criticalPath && traceResult.criticalPath.length > 0 && (
              <Tag color="geekblue">
                ⚡ 关键路径: {traceResult.criticalPath.length} 节点
              </Tag>
            )}
          </Space>

          {traceResult.status === 'error' && (
            <Alert
              type="error"
              message="链路存在异常"
              showIcon
              style={{ marginBottom: 8 }}
            />
          )}

          {traceResult.status === 'timeout' && (
            <Alert
              type="warning"
              message="链路存在超时"
              showIcon
              style={{ marginBottom: 8 }}
            />
          )}

          {traceResult.status === 'broken' && (
            <Alert
              type="error"
              message="链路存在断裂"
              description="部分节点的父节点不存在，可能是日志丢失或跨服务调用未被采集"
              showIcon
              style={{ marginBottom: 8 }}
            />
          )}

          <Tabs
            defaultActiveKey="graph"
            size="small"
            style={{ marginTop: 8 }}
            items={[
              {
                key: 'graph',
                label: '拓扑图',
                children: (
                  <>
                    <div ref={containerRef} style={{ border: '1px solid #f0f0f0', borderRadius: 4 }}>
                      <svg ref={svgRef} style={{ display: 'block' }} />
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                      提示：可拖拽节点、滚轮缩放查看。蓝色粗线表示关键路径，虚线圆圈表示断点
                    </div>
                  </>
                )
              },
              ...(traceResult.serviceStats && traceResult.serviceStats.length > 0
                ? [{
                    key: 'stats',
                    label: '服务耗时统计',
                    children: (
                      <Table
                        size="small"
                        columns={serviceStatsColumns}
                        dataSource={traceResult.serviceStats}
                        rowKey="service"
                        pagination={false}
                        scroll={{ x: 800 }}
                      />
                    )
                  }]
                : []),
              ...(traceResult.breakpoints && traceResult.breakpoints.length > 0
                ? [{
                    key: 'breakpoints',
                    label: `断点信息 (${traceResult.breakpoints.length})`,
                    children: (
                      <List
                        size="small"
                        dataSource={traceResult.breakpoints}
                        renderItem={(item) => (
                          <List.Item>
                            <List.Item.Meta
                              avatar={<WarningOutlined style={{ color: '#ff4d4f' }} />}
                              title={
                                <Space>
                                  <Text strong>{item.spanId}</Text>
                                  <Tag color="red">{item.reason}</Tag>
                                </Space>
                              }
                              description={dayjs(item.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS')}
                            />
                          </List.Item>
                        )}
                      />
                    )
                  }]
                : []),
              {
                key: 'timeline',
                label: '时间线',
                children: (
                  <Timeline
                    mode="left"
                    items={traceResult.nodes
                      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                      .map((node) => ({
                        color: statusColors[node.status] || 'blue',
                        dot: statusIcons[node.status],
                        children: (
                          <div>
                            <Space>
                              <Text strong>{node.service}</Text>
                              <Tag>{node.duration}ms</Tag>
                              {node.selfTime !== undefined && node.selfTime !== node.duration && (
                                <Tag color="geekblue">自耗 {node.selfTime}ms</Tag>
                              )}
                              {node.isBreakpoint && (
                                <Tag color="red">断点</Tag>
                              )}
                              {traceResult.criticalPath?.includes(node.spanId) && (
                                <Tag color="gold">关键路径</Tag>
                              )}
                            </Space>
                            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                              {dayjs(node.timestamp).format('HH:mm:ss.SSS')}
                            </div>
                          </div>
                        )
                      }))}
                  />
                )
              }
            ]}
          />
        </div>
      ) : (
        <Empty description="输入 Trace ID 开始链路追踪" style={{ marginTop: 60 }} />
      )}
    </Card>
  )
}
