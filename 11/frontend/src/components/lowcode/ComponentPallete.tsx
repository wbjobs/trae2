import React from 'react'
import { Card, Button, Space, Tooltip } from 'antd'
import { FilterOutlined, LineChartOutlined, TableOutlined, NodeIndexOutlined, ClusterOutlined } from '@ant-design/icons'
import { useLowCode } from './LowCodeContext'

interface ComponentPalleteProps {
  onAddComponent: (type: any) => void
}

const componentTypes = [
  { type: 'filter', label: '筛选器', icon: <FilterOutlined />, desc: '多维度日志筛选' },
  { type: 'chart', label: '图表', icon: <LineChartOutlined />, desc: '可视化图表' },
  { type: 'table', label: '表格', icon: <TableOutlined />, desc: '日志数据表格' },
  { type: 'trace-view', label: '链路追踪', icon: <NodeIndexOutlined />, desc: '溯源路径渲染' },
  { type: 'cluster-view', label: '聚类分析', icon: <ClusterOutlined />, desc: '异常日志聚类' }
]

export const ComponentPallete: React.FC<ComponentPalleteProps> = ({ onAddComponent }) => {
  const { addComponent } = useLowCode()

  const handleAdd = (type: any) => {
    addComponent(type)
    onAddComponent?.(type)
  }

  return (
    <Card title="组件面板" size="small" style={{ marginBottom: 16 }}>
      <Space wrap>
        {componentTypes.map((item) => (
          <Tooltip key={item.type} title={item.desc} placement="bottom">
            <Button
              icon={item.icon}
              onClick={() => handleAdd(item.type)}
              style={{ minWidth: 100 }}
            >
              {item.label}
            </Button>
          </Tooltip>
        ))}
      </Space>
    </Card>
  )
}