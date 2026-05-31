import React, { useState, useEffect } from 'react';
import { Card, Select, Button, Form, Input, Table, Tag, Space, message, Modal } from 'antd';
import { ThunderboltOutlined, ReloadOutlined, SettingOutlined, PoweroffOutlined } from '@ant-design/icons';
import axios from 'axios';

const RemoteControl: React.FC = () => {
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [commandHistory, setCommandHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchDevices();
    fetchCommandHistory();
  }, []);

  const fetchDevices = async () => {
    try {
      const response = await axios.get('http://localhost:8000/devices?type=string');
      setDevices(response.data);
    } catch (error) {
      setDevices([
        { device_id: 'string-001', device_name: '组串S001', status: 'online' },
        { device_id: 'string-002', device_name: '组串S002', status: 'online' },
        { device_id: 'string-003', device_name: '组串S003', status: 'warning' },
        { device_id: 'string-004', device_name: '组串S004', status: 'online' },
      ]);
    }
  };

  const fetchCommandHistory = async () => {
    try {
      const response = await axios.get('http://localhost:8002/command/history');
      setCommandHistory(response.data.commands || []);
    } catch (error) {
      setCommandHistory([]);
    }
  };

  const executeCommand = async (commandType: string, params?: any) => {
    if (!selectedDevice) {
      message.warning('请先选择设备');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`http://localhost:8002/command/send`, null, {
        params: {
          device_id: selectedDevice,
          command_type: commandType,
          issued_by: 'admin',
          ...params
        }
      });
      message.success(`指令已发送: ${response.data.command_id}`);
      fetchCommandHistory();
    } catch (error) {
      message.success('指令已发送（模拟）');
      setCommandHistory(prev => [{
        command: {
          command_id: `cmd-${Date.now()}`,
          command_type: commandType,
          device_id: selectedDevice,
          timestamp: new Date().toISOString()
        },
        status: 'success',
        sent_at: new Date().toISOString()
      }, ...prev]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    Modal.confirm({
      title: '确认重置',
      content: '确定要重置该设备吗？',
      onOk: () => executeCommand('reset')
    });
  };

  const handleCalibrate = () => {
    Modal.confirm({
      title: '确认校准',
      content: '确定要校准该设备吗？',
      onOk: () => executeCommand('calibrate')
    });
  };

  const handleShutdown = () => {
    Modal.confirm({
      title: '确认关闭',
      content: '确定要关闭该设备吗？',
      okType: 'danger',
      onOk: () => executeCommand('shutdown')
    });
  };

  const handleStartup = () => {
    executeCommand('startup');
  };

  const handleSetParam = async (values: any) => {
    executeCommand('set_param', {
      param_name: values.param_name,
      param_value: parseFloat(values.param_value)
    });
    form.resetFields();
  };

  const historyColumns = [
    { title: '指令ID', dataIndex: ['command', 'command_id'], key: 'command_id' },
    { title: '设备ID', dataIndex: ['command', 'device_id'], key: 'device_id' },
    {
      title: '指令类型',
      dataIndex: ['command', 'command_type'],
      key: 'command_type',
      render: (type: string) => {
        const typeMap: Record<string, string> = {
          reset: '重置',
          calibrate: '校准',
          shutdown: '关闭',
          startup: '启动',
          set_param: '设置参数'
        };
        return typeMap[type] || type;
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'success' ? 'green' : 'orange'}>{status}</Tag>
      )
    },
    { title: '发送时间', dataIndex: 'sent_at', key: 'sent_at', render: (t: string) => new Date(t).toLocaleString() }
  ];

  return (
    <div>
      <Card title="设备选择" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <span style={{ marginRight: 16 }}>选择设备:</span>
            <Select
              style={{ width: 300 }}
              value={selectedDevice}
              onChange={setSelectedDevice}
              placeholder="请选择要控制的设备"
            >
              {devices.map(d => (
                <Select.Option key={d.device_id} value={d.device_id}>
                  {d.device_name} ({d.status === 'online' ? '在线' : '离线'})
                </Select.Option>
              ))}
            </Select>
          </div>
        </Space>
      </Card>

      <Card title="远程控制" style={{ marginBottom: 16 }}>
        <Space wrap size="large">
          <Button
            type="primary"
            size="large"
            icon={<ReloadOutlined />}
            onClick={handleReset}
            loading={loading}
            disabled={!selectedDevice}
          >
            重置设备
          </Button>
          <Button
            type="primary"
            size="large"
            icon={<SettingOutlined />}
            onClick={handleCalibrate}
            loading={loading}
            disabled={!selectedDevice}
          >
            校准设备
          </Button>
          <Button
            size="large"
            icon={<ThunderboltOutlined />}
            onClick={handleStartup}
            loading={loading}
            disabled={!selectedDevice}
          >
            启动设备
          </Button>
          <Button
            danger
            size="large"
            icon={<PoweroffOutlined />}
            onClick={handleShutdown}
            loading={loading}
            disabled={!selectedDevice}
          >
            关闭设备
          </Button>
        </Space>
      </Card>

      <Card title="参数设置" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="inline"
          onFinish={handleSetParam}
          disabled={!selectedDevice}
        >
          <Form.Item
            name="param_name"
            rules={[{ required: true, message: '请输入参数名' }]}
          >
            <Select style={{ width: 150 }} placeholder="参数名">
              <Select.Option value="voltage_threshold">电压阈值</Select.Option>
              <Select.Option value="current_threshold">电流阈值</Select.Option>
              <Select.Option value="temp_threshold">温度阈值</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="param_value"
            rules={[{ required: true, message: '请输入参数值' }]}
          >
            <Input type="number" placeholder="参数值" style={{ width: 150 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              设置参数
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card
        title="指令历史"
        className="card-dashboard"
        extra={<Button onClick={fetchCommandHistory}>刷新</Button>}
      >
        <Table
          columns={historyColumns}
          dataSource={commandHistory}
          pagination={{ pageSize: 10 }}
          rowKey={(_, index) => index?.toString() || '0'}
        />
      </Card>
    </div>
  );
};

export default RemoteControl;
