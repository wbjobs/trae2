import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Table,
  Space,
  Tag,
  DatePicker,
  Select,
  Input,
  Modal,
  Form,
  Progress,
  Alert,
  message,
  Popconfirm,
  Statistic,
  Row,
  Col,
  List,
  Tooltip,
  Empty,
} from 'antd';
import {
  DownloadOutlined,
  ExportOutlined,
  FileTextOutlined,
  HistoryOutlined,
  DeleteOutlined,
  MergeOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import api from '../api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Search } = Input;

const ANOMALY_ACTION_LABELS = {
  rule_delete: '规则删除',
  node_unregister: '节点注销',
  link_fault: '链路故障',
  signal_lost: '信令丢失',
  error: '系统错误',
  warning: '系统警告',
  link_reset: '链路重置',
  signal_retry: '信令重传',
};

const ANOMALY_ACTION_COLORS = {
  rule_delete: 'red',
  node_unregister: 'orange',
  link_fault: 'red',
  signal_lost: 'orange',
  error: 'red',
  warning: 'gold',
  link_reset: 'orange',
  signal_retry: 'blue',
};

const EXPORT_STATUS_COLORS = {
  pending: 'default',
  processing: 'processing',
  completed: 'success',
  failed: 'error',
};

const EXPORT_STATUS_LABELS = {
  pending: '等待中',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
};

const TASK_TYPE_LABELS = {
  full: '完整导出',
  anomaly: '异常日志',
  custom: '自定义范围',
};

const AuditLogEnhanced = () => {
  const [activeTab, setActiveTab] = useState('anomaly');
  const [anomalyLogs, setAnomalyLogs] = useState([]);
  const [exportTasks, setExportTasks] = useState([]);
  const [archiveFiles, setArchiveFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const [exportForm] = Form.useForm();
  const [timeRange, setTimeRange] = useState([dayjs().subtract(7, 'day'), dayjs()]);
  const [actionFilter, setActionFilter] = useState();
  const [searchText, setSearchText] = useState('');
  const [stats, setStats] = useState(null);

  const fetchAnomalyLogs = async () => {
    setLoading(true);
    try {
      const params = {
        startTime: timeRange[0].toISOString(),
        endTime: timeRange[1].toISOString(),
        limit: 200,
      };
      if (actionFilter) params.action = actionFilter;
      if (searchText) params.keyword = searchText;

      const res = await api.audit.anomalyLogs(params);
      setAnomalyLogs(res.data?.data || []);

      const anomalyStats = {};
      (res.data?.data || []).forEach(log => {
        anomalyStats[log.action] = (anomalyStats[log.action] || 0) + 1;
      });
      setStats(anomalyStats);
    } catch (err) {
      message.error('获取异常日志失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchExportTasks = async () => {
    try {
      const res = await api.audit.batchExportList({ limit: 50 });
      setExportTasks(res.data?.data || []);
    } catch (err) {
      console.error('获取导出任务失败', err);
    }
  };

  const fetchArchiveFiles = async () => {
    try {
      const res = await api.audit.archiveFiles();
      setArchiveFiles(res.data?.data || []);
    } catch (err) {
      console.error('获取归档文件失败', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'anomaly') fetchAnomalyLogs();
    if (activeTab === 'export') fetchExportTasks();
    if (activeTab === 'archive') fetchArchiveFiles();
  }, [activeTab, timeRange, actionFilter, searchText]);

  const handleCreateExport = async (values) => {
    try {
      const data = {
        startTime: values.timeRange[0].toISOString(),
        endTime: values.timeRange[1].toISOString(),
        format: values.format,
        type: values.type,
        includeArchive: values.includeArchive,
      };
      if (values.actions && values.actions.length > 0) {
        data.actions = values.actions;
      }

      const res = await api.audit.batchExport(data);
      message.success('导出任务已创建');
      setExportModal(false);
      exportForm.resetFields();
      fetchExportTasks();

      const taskId = res.data?.data?.taskId;
      if (taskId) {
        const timer = setInterval(async () => {
          try {
            const statusRes = await api.audit.batchExportStatus(taskId);
            if (statusRes.data?.data?.status === 'completed') {
              clearInterval(timer);
              message.success('导出任务已完成');
              fetchExportTasks();
            } else if (statusRes.data?.data?.status === 'failed') {
              clearInterval(timer);
              message.error('导出任务失败');
              fetchExportTasks();
            }
          } catch (err) {
            clearInterval(timer);
          }
        }, 2000);
      }
    } catch (err) {
      message.error('创建导出任务失败');
    }
  };

  const handleDownloadExport = async (taskId, filename) => {
    try {
      const res = await api.audit.batchExportDownload(taskId);
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `audit-export-${dayjs().format('YYYYMMDD-HHmmss')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('下载成功');
    } catch (err) {
      message.error('下载失败');
    }
  };

  const handleExportAnomaly = async (format) => {
    try {
      const params = {
        startTime: timeRange[0].toISOString(),
        endTime: timeRange[1].toISOString(),
        format,
      };
      if (actionFilter) params.action = actionFilter;

      const res = await api.audit.anomalyExport(params);
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `anomaly-logs-${dayjs().format('YYYYMMDD-HHmmss')}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (err) {
      message.error('导出失败');
    }
  };

  const handleStreamExport = async () => {
    try {
      const params = {
        startTime: timeRange[0].toISOString(),
        endTime: timeRange[1].toISOString(),
      };
      const res = await api.audit.streamExport(params);
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-stream-${dayjs().format('YYYYMMDD-HHmmss')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('流式导出成功');
    } catch (err) {
      message.error('流式导出失败');
    }
  };

  const handleMergeArchives = async () => {
    try {
      const selectedFiles = archiveFiles.filter(f => f.size > 0).slice(0, 10).map(f => f.filename);
      if (selectedFiles.length < 2) {
        message.warning('至少需要选择2个文件进行合并');
        return;
      }
      await api.audit.archiveMerge({ files: selectedFiles });
      message.success('合并任务已提交');
      fetchArchiveFiles();
    } catch (err) {
      message.error('合并失败');
    }
  };

  const handleCleanupArchives = async (days) => {
    try {
      await api.audit.archiveCleanup({ keepDays: days });
      message.success(`已清理 ${days} 天前的归档文件`);
      fetchArchiveFiles();
    } catch (err) {
      message.error('清理失败');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const anomalyColumns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a, b) => dayjs(a.timestamp).valueOf() - dayjs(b.timestamp).valueOf(),
    },
    {
      title: '异常类型',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: (action) => (
        <Tag color={ANOMALY_ACTION_COLORS[action] || 'default'}>
          <WarningOutlined /> {ANOMALY_ACTION_LABELS[action] || action}
        </Tag>
      ),
    },
    {
      title: '操作人',
      dataIndex: 'operator',
      key: 'operator',
      width: 100,
    },
    {
      title: '实体类型',
      dataIndex: 'entity_type',
      key: 'entity_type',
      width: 100,
    },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      ellipsis: true,
    },
  ];

  const exportColumns = [
    {
      title: '任务ID',
      dataIndex: 'taskId',
      key: 'taskId',
      width: 150,
      render: (id) => id?.slice(0, 12) + '...',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (t) => <Tag>{TASK_TYPE_LABELS[t] || t}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const icons = {
          pending: <ClockCircleOutlined />,
          processing: <LoadingOutlined spin />,
          completed: <CheckCircleOutlined />,
          failed: <ExclamationCircleOutlined />,
        };
        return (
          <Tag color={EXPORT_STATUS_COLORS[status]} icon={icons[status]}>
            {EXPORT_STATUS_LABELS[status] || status}
          </Tag>
        );
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 150,
      render: (p, record) => (
        <Progress
          percent={record.status === 'completed' ? 100 : p || 0}
          size="small"
          status={record.status === 'failed' ? 'exception' : 'active'}
        />
      ),
    },
    {
      title: '记录数',
      dataIndex: 'totalRecords',
      key: 'totalRecords',
      width: 100,
      render: (n) => n?.toLocaleString() || '-',
    },
    {
      title: '文件大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 100,
      render: (s) => s ? formatFileSize(s) : '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          {record.status === 'completed' && (
            <Tooltip title="下载">
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => handleDownloadExport(record.taskId, record.filename)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const tabList = [
    { key: 'anomaly', tab: <span><WarningOutlined /> 异常日志</span> },
    { key: 'export', tab: <span><ExportOutlined /> 批量导出</span> },
    { key: 'archive', tab: <span><FileTextOutlined /> 归档管理</span> },
  ];

  return (
    <Card
      tabList={tabList}
      activeTabKey={activeTab}
      onTabChange={setActiveTab}
      title={
        <Space>
          <HistoryOutlined />
          审计日志增强
        </Space>
      }
      extra={
        activeTab === 'export' && (
          <Space>
            <Button icon={<ExportOutlined />} onClick={() => setExportModal(true)}>
              创建导出任务
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleStreamExport}>
              流式导出
            </Button>
          </Space>
        )
      }
    >
      {activeTab === 'anomaly' && (
        <div>
          {stats && Object.keys(stats).length > 0 && (
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              {Object.entries(stats).map(([action, count]) => (
                <Col span={4} key={action}>
                  <Card size="small">
                    <Statistic
                      title={
                        <Tag color={ANOMALY_ACTION_COLORS[action]} style={{ margin: 0 }}>
                          {ANOMALY_ACTION_LABELS[action] || action}
                        </Tag>
                      }
                      value={count}
                      valueStyle={{ fontSize: 20 }}
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          )}

          <Alert
            message="异常日志包含系统检测到的所有异常操作，可用于故障排查和安全审计"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Space style={{ marginBottom: 16, width: '100%' }} wrap>
            <RangePicker
              showTime
              value={timeRange}
              onChange={setTimeRange}
              style={{ width: 380 }}
            />
            <Select
              placeholder="异常类型"
              style={{ width: 150 }}
              allowClear
              value={actionFilter}
              onChange={setActionFilter}
            >
              {Object.entries(ANOMALY_ACTION_LABELS).map(([key, label]) => (
                <Option key={key} value={key}>{label}</Option>
              ))}
            </Select>
            <Search
              placeholder="搜索详情"
              style={{ width: 200 }}
              allowClear
              onSearch={setSearchText}
              onChange={(e) => !e.target.value && setSearchText('')}
            />
            <Button icon={<DownloadOutlined />} onClick={() => handleExportAnomaly('csv')}>
              导出CSV
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => handleExportAnomaly('json')}>
              导出JSON
            </Button>
          </Space>

          <Table
            rowKey="id"
            columns={anomalyColumns}
            dataSource={anomalyLogs}
            loading={loading}
            size="small"
            pagination={{ pageSize: 20 }}
            scroll={{ y: 400 }}
            locale={{ emptyText: <Empty description="暂无异常日志" /> }}
          />
        </div>
      )}

      {activeTab === 'export' && (
        <div>
          <Alert
            message="批量导出支持异步处理大文件，可在任务列表中查看进度和下载结果"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Table
            rowKey="taskId"
            columns={exportColumns}
            dataSource={exportTasks}
            size="small"
            pagination={{ pageSize: 10 }}
            scroll={{ y: 400 }}
            locale={{ emptyText: <Empty description="暂无导出任务" /> }}
          />
        </div>
      )}

      {activeTab === 'archive' && (
        <div>
          <Alert
            message="归档文件按小时自动拆分，超过10MB自动分割，默认保留30天"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Space style={{ marginBottom: 16 }}>
            <Button icon={<MergeOutlined />} onClick={handleMergeArchives}>
              合并归档
            </Button>
            <Popconfirm
              title="确认清理7天前的归档文件？"
              onConfirm={() => handleCleanupArchives(7)}
              okText="确认"
              cancelText="取消"
            >
              <Button icon={<DeleteOutlined />} danger>
                清理7天前
              </Button>
            </Popconfirm>
            <Popconfirm
              title="确认清理30天前的归档文件？"
              onConfirm={() => handleCleanupArchives(30)}
              okText="确认"
              cancelText="取消"
            >
              <Button icon={<DeleteOutlined />} danger>
                清理30天前
              </Button>
            </Popconfirm>
          </Space>

          {archiveFiles.length > 0 && (
            <Row gutter={[16, 16]}>
              <Col span={6}>
                <Card size="small">
                  <Statistic title="归档文件总数" value={archiveFiles.length} />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="总大小"
                    value={archiveFiles.reduce((sum, f) => sum + (f.size || 0), 0)}
                    formatter={formatFileSize}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="最大文件"
                    value={Math.max(...archiveFiles.map(f => f.size || 0))}
                    formatter={formatFileSize}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="平均大小"
                    value={Math.round(archiveFiles.reduce((sum, f) => sum + (f.size || 0), 0) / archiveFiles.length)}
                    formatter={formatFileSize}
                  />
                </Card>
              </Col>
            </Row>
          )}

          <List
            style={{ marginTop: 16 }}
            dataSource={archiveFiles}
            renderItem={(file) => (
              <List.Item
                actions={[
                  <Tooltip title="查看">
                    <Button
                      type="link"
                      size="small"
                      icon={<FileTextOutlined />}
                      onClick={async () => {
                        try {
                          const res = await api.audit.archiveFile(file.filename);
                          Modal.info({
                            title: file.filename,
                            width: 800,
                            content: (
                              <pre style={{ maxHeight: 400, overflow: 'auto', fontSize: 12 }}>
                                {JSON.stringify(res.data?.data?.slice(0, 100), null, 2)}
                                {res.data?.data?.length > 100 && `\n... 共 ${res.data.data.length} 条记录`}
                              </pre>
                            ),
                          });
                        } catch (err) {
                          message.error('读取文件失败');
                        }
                      }}
                    />
                  </Tooltip>,
                  <Tooltip title="下载">
                    <Button
                      type="link"
                      size="small"
                      icon={<DownloadOutlined />}
                      onClick={() => {
                        const content = JSON.stringify(file, null, 2);
                        const blob = new Blob([content]);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = file.filename;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    />
                  </Tooltip>,
                ]}
              >
                <List.Item.Meta
                  title={<Space><FileTextOutlined /> {file.filename}</Space>}
                  description={
                    <Space>
                      <Tag color="blue">{formatFileSize(file.size || 0)}</Tag>
                      <span>{dayjs(file.modifiedAt).format('YYYY-MM-DD HH:mm:ss')}</span>
                      {file.recordsCount && <span>{file.recordsCount.toLocaleString()} 条记录</span>}
                    </Space>
                  }
                />
              </List.Item>
            )}
            locale={{ emptyText: <Empty description="暂无归档文件" /> }}
          />
        </div>
      )}

      <Modal
        title="创建批量导出任务"
        open={exportModal}
        onCancel={() => setExportModal(false)}
        footer={null}
        width={500}
      >
        <Form form={exportForm} layout="vertical" onFinish={handleCreateExport}>
          <Form.Item
            name="timeRange"
            label="时间范围"
            rules={[{ required: true, message: '请选择时间范围' }]}
            initialValue={[dayjs().subtract(7, 'day'), dayjs()]}
          >
            <RangePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="type"
            label="导出类型"
            rules={[{ required: true, message: '请选择导出类型' }]}
            initialValue="full"
          >
            <Select>
              <Option value="full">完整导出</Option>
              <Option value="anomaly">仅异常日志</Option>
              <Option value="custom">自定义</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="format"
            label="导出格式"
            rules={[{ required: true, message: '请选择导出格式' }]}
            initialValue="csv"
          >
            <Select>
              <Option value="csv">CSV 格式</Option>
              <Option value="json">JSON 格式</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="actions"
            label="操作类型筛选"
            tooltip="留空则导出所有类型"
          >
            <Select mode="multiple" placeholder="选择要导出的操作类型">
              {Object.entries(ANOMALY_ACTION_LABELS).map(([key, label]) => (
                <Option key={key} value={key}>{label}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="includeArchive"
            label="包含归档文件"
            initialValue={true}
            valuePropName="checked"
          >
            <Select>
              <Option value={true}>是（包含历史归档数据）</Option>
              <Option value={false}>否（仅当前文件）</Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setExportModal(false)}>取消</Button>
              <Button type="primary" htmlType="submit">创建任务</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default AuditLogEnhanced;
