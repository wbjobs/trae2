import React, { useState, useEffect } from 'react';
import { Card, Tree, Tag, Space, Descriptions, Button } from 'antd';
import { ThunderboltOutlined, ApartmentOutlined, DeploymentUnitOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import axios from 'axios';

const Topology: React.FC = () => {
  const [topology, setTopology] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [nodeData, setNodeData] = useState<any>(null);

  useEffect(() => {
    fetchTopology();
  }, []);

  const fetchTopology = async () => {
    try {
      const response = await axios.get('http://localhost:8000/topology');
      setTopology(response.data);
    } catch (error) {
      const mockTopology = {
        id: 'station-beijing',
        name: '北京光伏电站',
        type: 'station',
        status: 'online',
        children: [
          {
            id: 'inverter-001',
            name: '逆变器A01',
            type: 'inverter',
            status: 'online',
            children: [
              { id: 'string-001', name: '组串S001', type: 'string', status: 'online', children: [] },
              { id: 'string-002', name: '组串S002', type: 'string', status: 'online', children: [] }
            ]
          },
          {
            id: 'inverter-002',
            name: '逆变器A02',
            type: 'inverter',
            status: 'online',
            children: [
              { id: 'string-003', name: '组串S003', type: 'string', status: 'warning', children: [] },
              { id: 'string-004', name: '组串S004', type: 'string', status: 'online', children: [] }
            ]
          }
        ]
      };
      setTopology(mockTopology);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'green';
      case 'warning': return 'orange';
      case 'error': return 'red';
      default: return 'default';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'station': return <ApartmentOutlined />;
      case 'inverter': return <DeploymentUnitOutlined />;
      case 'string': return <ThunderboltOutlined />;
      default: return null;
    }
  };

  const convertToTreeData = (node: any): any => {
    return {
      title: (
        <Space>
          {getIcon(node.type)}
          <span>{node.name}</span>
          <Tag color={getStatusColor(node.status)} size="small">
            {node.status === 'online' ? '在线' : node.status === 'warning' ? '告警' : '离线'}
          </Tag>
        </Space>
      ),
      key: node.id,
      children: node.children?.map(convertToTreeData)
    };
  };

  const handleSelect = async (selectedKeys: string[]) => {
    if (selectedKeys.length > 0) {
      const nodeId = selectedKeys[0];
      try {
        const response = await axios.get(`http://localhost:8000/devices/${nodeId}`);
        setSelectedNode(response.data);
        
        if (response.data.device_type === 'string') {
          const dataResp = await axios.get(`http://localhost:8000/data/latest/${nodeId}`);
          setNodeData(dataResp.data);
        }
      } catch (error) {
        setSelectedNode({ device_id: nodeId, device_name: '设备', device_type: 'string', status: 'online', location: '测试位置' });
        setNodeData({ voltage: 550, current: 8.5, temperature: 45, power: 4675 });
      }
    }
  };

  const treeData = topology ? [convertToTreeData(topology)] : [];

  return (
    <Row gutter={16}>
      <Col span={8}>
        <Card title="设备拓扑树" className="card-dashboard">
          <Tree
            showLine
            defaultExpandAll
            treeData={treeData}
            onSelect={handleSelect}
          />
        </Card>
      </Col>
      <Col span={16}>
        <Card title="设备详情" className="card-dashboard">
          {selectedNode ? (
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <Descriptions bordered column={2}>
                <Descriptions.Item label="设备ID">{selectedNode.device_id}</Descriptions.Item>
                <Descriptions.Item label="设备名称">{selectedNode.device_name}</Descriptions.Item>
                <Descriptions.Item label="设备类型">{selectedNode.device_type}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={getStatusColor(selectedNode.status)}>
                    {selectedNode.status === 'online' ? '在线' : selectedNode.status === 'warning' ? '告警' : '离线'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="位置" span={2}>{selectedNode.location}</Descriptions.Item>
              </Descriptions>

              {nodeData && (
                <Card title="实时数据" size="small">
                  <Descriptions bordered column={2}>
                    <Descriptions.Item label="电压">{nodeData.voltage} V</Descriptions.Item>
                    <Descriptions.Item label="电流">{nodeData.current} A</Descriptions.Item>
                    <Descriptions.Item label="温度">{nodeData.temperature} °C</Descriptions.Item>
                    <Descriptions.Item label="功率">{(nodeData.power / 1000).toFixed(2)} kW</Descriptions.Item>
                  </Descriptions>
                </Card>
              )}

              <Space>
                <Button type="primary">查看历史数据</Button>
                <Button>远程控制</Button>
              </Space>
            </Space>
          ) : (
            <div style={{ textAlign: 'center', padding: 50, color: '#999' }}>
              请选择一个设备查看详情
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
};

export default Topology;
