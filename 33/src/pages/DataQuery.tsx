import React, { useState, useEffect } from 'react';
import {
  Row, Col, Card, Form, Select, DatePicker, Button, Table, Tag,
  Space, Spin, message, Modal, Descriptions, Popconfirm, Input
} from 'antd';
import { SearchOutlined, DownloadOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import type { TablePaginationConfig } from 'antd/es/table';
import { SoundingData, StationInfo, QueryParams } from '@/types';
import { soundingService } from '@/services/soundingService';
import { dataCleaner } from '@/modules/dataFusion';
import { exportReport } from '@/modules/export';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;

const DataQuery: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [dataList, setDataList] = useState<SoundingData[]>([]);
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0
  });
  const [selectedRecord, setSelectedRecord] = useState<SoundingData | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  useEffect(() => {
    loadStations();
    loadData({ pageNum: 1, pageSize: 10 });
  }, []);

  const loadStations = async () => {
    try {
      const data = await soundingService.getStationList();
      setStations(data);
    } catch (error) {
      message.error('站点加载失败');
    }
  };

  const loadData = async (params: QueryParams) => {
    setLoading(true);
    try {
      const data = await soundingService.getSoundingDataList(params);
      setDataList(data.list);
      setPagination({
        current: data.pageNum,
        pageSize: data.pageSize,
        total: data.total
      });
    } catch (error) {
      message.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (values: any) => {
    const { timeRange, ...restValues } = values;
    const params: QueryParams = {
      pageNum: 1,
      pageSize: pagination.pageSize || 10,
      ...restValues
    };
    if (timeRange && timeRange.length === 2) {
      params.startTime = timeRange[0]?.format('YYYY-MM-DD HH:mm:ss');
      params.endTime = timeRange[1]?.format('YYYY-MM-DD HH:mm:ss');
    }
    setPagination(prev => ({ ...prev, current: 1 }));
    loadData(params);
  };

  const handleTableChange = (pag: TablePaginationConfig) => {
    const values = form.getFieldsValue();
    const { timeRange, ...restValues } = values;
    const params: QueryParams = {
      pageNum: pag.current || 1,
      pageSize: pag.pageSize || 10,
      ...restValues
    };
    if (timeRange && timeRange.length === 2) {
      params.startTime = timeRange[0]?.format('YYYY-MM-DD HH:mm:ss');
      params.endTime = timeRange[1]?.format('YYYY-MM-DD HH:mm:ss');
    }
    loadData(params);
  };

  const handleViewDetail = (record: SoundingData) => {
    setSelectedRecord(record);
    setDetailVisible(true);
  };

  const handleExport = (record: SoundingData) => {
    exportReport({
      format: 'excel',
      soundingData: record,
      filename: `探空数据_${record.stationId}_${record.soundingTime}`
    });
    message.success('导出成功');
  };

  const handleDelete = (id: string) => {
    message.success('删除成功');
    loadData({
      pageNum: pagination.current || 1,
      pageSize: pagination.pageSize || 10
    });
  };

  const columns = [
    {
      title: '站点编号',
      dataIndex: 'stationId',
      key: 'stationId',
      width: 100
    },
    {
      title: '站点名称',
      dataIndex: 'stationName',
      key: 'stationName',
      width: 120
    },
    {
      title: '探空时间',
      dataIndex: 'soundingTime',
      key: 'soundingTime',
      width: 160
    },
    {
      title: '经纬度',
      key: 'location',
      width: 180,
      render: (_: any, record: SoundingData) =>
        `${record.latitude.toFixed(4)}°N, ${record.longitude.toFixed(4)}°E`
    },
    {
      title: '数据点数',
      dataIndex: ['dataPoints', 'length'],
      key: 'pointCount',
      width: 100
    },
    {
      title: '最大高度',
      dataIndex: 'maxHeight',
      key: 'maxHeight',
      width: 100,
      render: (h: number) => `${h} m`
    },
    {
      title: '数据质量',
      dataIndex: 'dataQuality',
      key: 'dataQuality',
      width: 100,
      render: (q: string) => (
        <Tag color={q === 'good' ? 'green' : q === 'fair' ? 'orange' : 'red'}>
          {q === 'good' ? '优质' : q === 'fair' ? '一般' : '较差'}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: any, record: SoundingData) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          <Button
            type="link"
            icon={<DownloadOutlined />}
            onClick={() => handleExport(record)}
          >
            导出
          </Button>
          <Popconfirm
            title="确定删除这条记录？"
            onConfirm={() => handleDelete(record.stationId)}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div className="page-container">
      <Card className="card-shadow" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="inline"
          onFinish={handleSearch}
        >
          <Form.Item name="stationId" label="站点">
            <Select placeholder="请选择站点" style={{ width: 200 }} allowClear>
              {stations.map(s => (
                <Option key={s.stationId} value={s.stationId}>
                  {s.stationName}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="timeRange" label="时间范围">
            <RangePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              style={{ width: 350 }}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              查询
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card className="card-shadow">
        <Table
          loading={loading}
          dataSource={dataList}
          columns={columns}
          rowKey={(record: SoundingData) => (record as any).id || `${record.stationId}_${record.soundingTime}`}
          pagination={pagination}
          onChange={handleTableChange}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Modal
        title="探空数据详情"
        open={detailVisible}
        width={800}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            关闭
          </Button>,
          <Button
            key="export"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => selectedRecord && handleExport(selectedRecord)}
          >
            导出数据
          </Button>
        ]}
      >
        {selectedRecord && (
          <div>
            <Descriptions title="基本信息" bordered column={2} size="small">
              <Descriptions.Item label="站点编号">{selectedRecord.stationId}</Descriptions.Item>
              <Descriptions.Item label="站点名称">{selectedRecord.stationName}</Descriptions.Item>
              <Descriptions.Item label="探空时间">{selectedRecord.soundingTime}</Descriptions.Item>
              <Descriptions.Item label="释放时间">{selectedRecord.releaseTime}</Descriptions.Item>
              <Descriptions.Item label="纬度">{selectedRecord.latitude.toFixed(4)}°N</Descriptions.Item>
              <Descriptions.Item label="经度">{selectedRecord.longitude.toFixed(4)}°E</Descriptions.Item>
              <Descriptions.Item label="海拔高度">{selectedRecord.elevation} m</Descriptions.Item>
              <Descriptions.Item label="最大高度">{selectedRecord.maxHeight} m</Descriptions.Item>
              <Descriptions.Item label="数据点数">{selectedRecord.dataPoints.length}</Descriptions.Item>
              <Descriptions.Item label="数据质量">
                <Tag color={selectedRecord.dataQuality === 'good' ? 'green' : 'orange'}>
                  {selectedRecord.dataQuality === 'good' ? '优质' : '一般'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 16 }}>
              <h4>数据质量报告</h4>
              <QualityReport points={selectedRecord.dataPoints} />
            </div>

            <div style={{ marginTop: 16 }}>
              <h4>廓线数据（前10条）</h4>
              <Table
                size="small"
                dataSource={selectedRecord.dataPoints.slice(0, 10)}
                columns={[
                  { title: '气压(hPa)', dataIndex: 'pressure', key: 'pressure' },
                  { title: '高度(m)', dataIndex: 'height', key: 'height' },
                  { title: '温度(°C)', dataIndex: 'temperature', key: 'temperature' },
                  { title: '露点(°C)', dataIndex: 'dewPoint', key: 'dewPoint' },
                  { title: '湿度(%)', dataIndex: 'relativeHumidity', key: 'rh' },
                  { title: '风速(m/s)', dataIndex: 'windSpeed', key: 'ws' }
                ]}
                pagination={false}
                rowKey="pressure"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

const QualityReport: React.FC<{ points: any[] }> = ({ points }) => {
  const report = dataCleaner.clean(points).qualityReport;

  return (
    <Row gutter={16}>
      <Col span={8}>
        <div className="quality-score">
          <div
            className="score-circle"
            style={{
              background: report.qualityScore >= 80 ? '#52c41a' : report.qualityScore >= 60 ? '#faad14' : '#ff4d4f',
              color: '#fff'
            }}
          >
            {report.qualityScore}
          </div>
          <div className="score-label">质量评分</div>
        </div>
      </Col>
      <Col span={8}>
        <p>总数据点数：{report.totalPoints}</p>
        <p>有效数据点数：{report.validPoints}</p>
        <p>无效数据点数：{report.invalidPoints}</p>
      </Col>
      <Col span={8}>
        <p>缺失字段统计：</p>
        {Object.entries(report.missingFields).map(([key, value]) => (
          value > 0 && <p key={key}>{key}: {value}个</p>
        ))}
      </Col>
    </Row>
  );
};

export default DataQuery;
