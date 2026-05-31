import React from 'react'
import { Table, Tag } from 'antd'
import { CheckCircleOutlined, WarningOutlined, ExclamationCircleOutlined } from '@ant-design/icons'

interface Device {
  device_id: string
  device_name: string
  device_type: string
  location: string
  status: string
  anomaly_count: number
  record_count: number
  last_update: string
}

interface DeviceStatusListProps {
  devices: Device[]
  onDeviceSelect: (deviceId: string) => void
  selectedDevice: string | null
}

const DeviceStatusList: React.FC<DeviceStatusListProps> = ({ devices, onDeviceSelect, selectedDevice }) => {
  const statusColors: Record<string, string> = {
    normal: 'success',
    warning: 'warning',
    critical: 'error'
  }

  const statusIcons: Record<string, React.ReactNode> = {
    normal: <CheckCircleOutlined style={{ color: '#66bb6a' }} />,
    warning: <WarningOutlined style={{ color: '#ffa726' }} />,
    critical: <ExclamationCircleOutlined style={{ color: '#ef5350' }} />
  }

  const columns = [
    {
      title: '设备状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => (
        <span title={status}>
          {statusIcons[status] || statusIcons.normal}
        </span>
      )
    },
    {
      title: '设备ID',
      dataIndex: 'device_id',
      key: 'device_id',
      width: 100
    },
    {
      title: '设备名称',
      dataIndex: 'device_name',
      key: 'device_name'
    },
    {
      title: '设备类型',
      dataIndex: 'device_type',
      key: 'device_type',
      width: 100
    },
    {
      title: '位置',
      dataIndex: 'location',
      key: 'location',
      width: 100
    },
    {
      title: '异常数',
      dataIndex: 'anomaly_count',
      key: 'anomaly_count',
      width: 80,
      render: (count: number) => (
        <Tag color={count > 5 ? 'red' : count > 0 ? 'orange' : 'green'}>
          {count}
        </Tag>
      )
    }
  ]

  return (
    <div className="chart-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="chart-title">设备状态列表</div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Table
          dataSource={devices}
          columns={columns}
          rowKey="device_id"
          size="small"
          pagination={false}
          scroll={{ y: 280 }}
          onRow={(record) => ({
            onClick: () => onDeviceSelect(record.device_id),
            style: {
              cursor: 'pointer',
              background: selectedDevice === record.device_id ? 'rgba(79, 195, 247, 0.1)' : 'transparent'
            }
          })}
        />
      </div>
    </div>
  )
}

export default DeviceStatusList
