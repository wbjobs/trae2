import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Table, Tag, Button, Switch, Modal, Form, Input, Select, Space, message, Popconfirm, Descriptions, Statistic } from 'antd';
import { SettingOutlined, ReloadOutlined, PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import api from '../api/index.js';

const SEVERITY_COLORS = {
  NORMAL: 'green',
  WARNING: 'orange',
  CRITICAL: 'red',
  FATAL: 'volcano',
};

const LINK_TYPE_OPTIONS = [
  { value: 'fiber', label: '光纤' },
  { value: 'wireless', label: '无线' },
  { value: 'copper', label: '铜缆' },
  { value: 'all', label: '全部' },
];

const METRIC_OPTIONS = [
  { value: 'latency', label: '延迟' },
  { value: 'packet_loss', label: '丢包率' },
  { value: 'jitter', label: '抖动' },
  { value: 'availability', label: '可用率' },
];

const OPERATOR_OPTIONS = [
  { value: '>', label: '大于 (>)' },
  { value: '>=', label: '大于等于 (>=)' },
  { value: '<', label: '小于 (<)' },
  { value: '<=', label: '小于等于 (<=)' },
  { value: '==', label: '等于 (==)' },
  { value: '!=', label: '不等于 (!=)' },
  { value: 'between', label: '区间 (between)' },
];

const SEVERITY_OPTIONS = [
  { value: 'WARNING', label: '告警' },
  { value: 'CRITICAL', label: '严重' },
  { value: 'FATAL', label: '致命' },
];

export default function RuleManagement() {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);
  const [stats, setStats] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [rulesRes, statsRes] = await Promise.all([
        api.analysis.rules().catch(() => ({ data: { data: [] } })),
        api.analysis.ruleStats().catch(() => ({ data: { data: null } })),
      ]);
      setRules(rulesRes.data?.data || []);
      setStats(statsRes.data?.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggle = async (id, enabled) => {
    try {
      await api.analysis.toggleRule(id, enabled);
      message.success(enabled ? '规则已启用' : '规则已禁用');
      loadData();
    } catch (err) {
      message.error('操作失败: ' + err.message);
    }
  };

  const handleAdd = () => {
    setEditingRule(null);
    form.resetFields();
    form.setFieldsValue({
      linkType: 'fiber',
      metric: 'latency',
      operator: '>',
      threshold: 100,
      severity: 'WARNING',
      enabled: true,
    });
    setModalVisible(true);
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    form.setFieldsValue({
      name: rule.name,
      description: rule.description,
      linkType: rule.linkType,
      metric: rule.metric,
      operator: rule.operator,
      threshold: rule.threshold,
      thresholdMax: rule.thresholdMax,
      severity: rule.severity,
      enabled: rule.enabled,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await api.analysis.deleteRule(id);
      message.success('规则已删除');
      loadData();
    } catch (err) {
      message.error('删除失败: ' + err.message);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingRule) {
        await api.analysis.updateRule(editingRule.id, values);
        message.success('规则已更新');
      } else {
        await api.analysis.addRule(values);
        message.success('规则已创建');
      }
      setModalVisible(false);
      loadData();
    } catch (err) {
      console.error('保存失败:', err);
    }
  };

  const columns = [
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 70,
      render: (v, record) => (
        <Switch
          size="small"
          checked={v}
          onChange={(checked) => handleToggle(record.id, checked)}
        />
      ),
    },
    {
      title: '规则名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (v, record) => (
        <span className={record.enabled ? '' : 'rule-disabled'}>{v}</span>
      ),
    },
    {
      title: '链路类型',
      dataIndex: 'linkType',
      key: 'linkType',
      width: 100,
      render: (t) => {
        const opt = LINK_TYPE_OPTIONS.find(o => o.value === t);
        return <Tag>{opt?.label || t}</Tag>;
      },
    },
    {
      title: '指标',
      dataIndex: 'metric',
      key: 'metric',
      width: 100,
      render: (m) => {
        const opt = METRIC_OPTIONS.find(o => o.value === m);
        return opt?.label || m;
      },
    },
    {
      title: '条件',
      key: 'condition',
      width: 180,
      render: (_, record) => {
        const metric = METRIC_OPTIONS.find(o => o.value === record.metric)?.label || record.metric;
        const op = OPERATOR_OPTIONS.find(o => o.value === record.operator)?.label || record.operator;
        if (record.operator === 'between') {
          return `${metric} ${op} ${record.threshold} ~ ${record.thresholdMax}`;
        }
        return `${metric} ${op} ${record.threshold}`;
      },
    },
    {
      title: '严重度',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (s) => <Tag color={SEVERITY_COLORS[s] || 'default'}>{s}</Tag>,
    },
    {
      title: '命中次数',
      dataIndex: 'hitCount',
      key: 'hitCount',
      width: 100,
      render: (v) => v || 0,
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除此规则?" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <SettingOutlined style={{ fontSize: 28, color: '#1677ff' }} />
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1677ff', margin: '8px 0' }}>{stats?.totalRules || rules.length}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>规则总数</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <CheckCircleOutlined style={{ fontSize: 28, color: '#52c41a' }} />
            <div style={{ fontSize: 28, fontWeight: 700, color: '#52c41a', margin: '8px 0' }}>{stats?.enabledRules || rules.filter(r => r.enabled).length}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>启用规则</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <CloseCircleOutlined style={{ fontSize: 28, color: '#999' }} />
            <div style={{ fontSize: 28, fontWeight: 700, color: '#999', margin: '8px 0' }}>{stats?.disabledRules || rules.filter(r => !r.enabled).length}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>禁用规则</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#722ed1', margin: '8px 0' }}>{stats?.totalHits || 0}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>总命中次数</div>
          </Card>
        </Col>
      </Row>

      <Card
        title="规则列表"
        style={{ marginTop: 16 }}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增规则</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={rules}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 10, size: 'small' }}
        />
      </Card>

      <Modal
        title={editingRule ? '编辑规则' : '新增规则'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSave}
        width={600}
      >
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input placeholder="例如: 光纤延迟超过100ms" />
          </Form.Item>
          <Form.Item name="description" label="规则描述">
            <Input.TextArea rows={2} placeholder="描述此规则的用途" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="linkType" label="链路类型" rules={[{ required: true }]}>
                <Select options={LINK_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="severity" label="严重度" rules={[{ required: true }]}>
                <Select options={SEVERITY_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="metric" label="监测指标" rules={[{ required: true }]}>
                <Select options={METRIC_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="operator" label="比较操作符" rules={[{ required: true }]}>
                <Select options={OPERATOR_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="enabled" label="启用状态" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="threshold" label="阈值" rules={[{ required: true }]}>
                <Input type="number" placeholder="阈值" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.operator !== curr.operator}>
                {({ getFieldValue }) =>
                  getFieldValue('operator') === 'between' ? (
                    <Form.Item name="thresholdMax" label="最大阈值" rules={[{ required: true }]}>
                      <Input type="number" placeholder="区间最大值" />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
