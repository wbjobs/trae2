import React, { useEffect } from 'react'
import { Card, List, Tag, Progress, Empty, Space, Select, Badge, Button } from 'antd'
import { FireOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import type { AnomalyCluster } from '../../types'
import { useAppStore } from '../../store'
import { clusterApi } from '../../api'

const severityColorMap: Record<string, string> = {
  low: 'blue',
  medium: 'orange',
  high: 'red',
  critical: 'magenta'
}

export const ClusterViewComponent: React.FC = () => {
  const { anomalyClusters, setAnomalyClusters, setClustersLoading, clustersLoading } = useAppStore()
  const [severityFilter, setSeverityFilter] = React.useState<string>('')

  const fetchClusters = async () => {
    setClustersLoading(true)
    try {
      const res = await clusterApi.getAnomalyClusters({
        severity: severityFilter || undefined
      })
      setAnomalyClusters(res.data || [])
    } catch (error) {
      console.error('Get clusters failed:', error)
    } finally {
      setClustersLoading(false)
    }
  }

  useEffect(() => {
    fetchClusters()
  }, [severityFilter])

  const filteredClusters = severityFilter
    ? anomalyClusters.filter((c) => c.severity === severityFilter)
    : anomalyClusters

  return (
    <Card
      title={
        <Space>
          <ExclamationCircleOutlined />
          <span>异常日志聚类</span>
          <Badge count={anomalyClusters.length} style={{ backgroundColor: '#ff4d4f' }} />
        </Space>
      }
      size="small"
      extra={
        <Space>
          <Select
            placeholder="严重程度"
            value={severityFilter}
            onChange={setSeverityFilter}
            style={{ width: 120 }}
            size="small"
            allowClear
            options={[
              { value: 'low', label: '低' },
              { value: 'medium', label: '中' },
              { value: 'high', label: '高' },
              { value: 'critical', label: '严重' }
            ]}
          />
          <Button size="small" onClick={fetchClusters}>刷新</Button>
        </Space>
      }
      style={{ height: '100%', overflow: 'hidden' }}
    >
      {filteredClusters.length > 0 ? (
        <List
          loading={clustersLoading}
          dataSource={filteredClusters}
          renderItem={(cluster) => (
            <List.Item
              key={cluster.clusterId}
              style={{
                padding: '8px 0',
                borderBottom: '1px solid #f0f0f0',
                cursor: 'pointer'
              }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                <Space>
                  <Tag color={severityColorMap[cluster.severity]}>
                    {cluster.severity.toUpperCase()}
                  </Tag>
                  <Tag color="blue">
                    <FireOutlined /> {cluster.count} 次
                  </Tag>
                  {cluster.affectedServices.map((s) => (
                    <Tag key={s}>{s}</Tag>
                  ))}
                </Space>
                <div
                  style={{
                    fontSize: 12,
                    color: '#666',
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {cluster.pattern}
                </div>
                <Progress
                  percent={Math.min((cluster.count / 100) * 100, 100)}
                  size="small"
                  status={cluster.severity === 'critical' ? 'exception' : 'normal'}
                  style={{ margin: 0 }}
                />
              </Space>
            </List.Item>
          )}
          style={{ maxHeight: 400, overflowY: 'auto' }}
        />
      ) : (
        <Empty description="暂无异常聚类" />
      )}
    </Card>
  )
}