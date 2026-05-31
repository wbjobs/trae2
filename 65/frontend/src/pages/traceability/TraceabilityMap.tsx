import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Space,
  Timeline,
  Tag,
  Typography,
  Row,
  Col,
  Empty,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  message,
  Alert
} from 'antd';
import {
  ArrowLeftOutlined,
  EnvironmentOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { traceabilityService, specimenService } from '../../services/specimen.service';
import { TraceabilityRecord, TraceType } from '../../types';
import { useAuthStore, isCurator } from '../../store/authStore';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const isValidCoordinate = (lat: any, lng: any): boolean => {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (isNaN(latitude) || isNaN(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
};

const MapController: React.FC<{ center: [number, number]; records: TraceabilityRecord[] }> = ({ center, records }) => {
  const map = useMap();
  
  useEffect(() => {
    if (records.length > 1) {
      const bounds = records.map((r) => [Number(r.latitude), Number(r.longitude)] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (records.length === 1) {
      map.setView(center, 8);
    }
  }, [center, records, map]);

  return null;
};

const TraceabilityMap: React.FC = () => {
  const { specimenId } = useParams<{ specimenId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [records, setRecords] = useState<TraceabilityRecord[]>([]);
  const [specimenName, setSpecimenName] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TraceabilityRecord | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    if (specimenId) {
      loadRecords();
      loadSpecimenInfo();
    }
  }, [specimenId]);

  const loadSpecimenInfo = async () => {
    try {
      const result = await specimenService.getSpecimen(Number(specimenId));
      setSpecimenName(result.specimen.name);
    } catch (error) {
      console.error('加载标本信息失败:', error);
    }
  };

  const loadRecords = async () => {
    setLoading(true);
    try {
      const result = await traceabilityService.getTraceRecordsBySpecimenId(Number(specimenId));
      const sortedRecords = result.records.sort((a, b) => {
        const dateA = new Date(a.traceDate).getTime();
        const dateB = new Date(b.traceDate).getTime();
        return dateA - dateB;
      });
      setRecords(sortedRecords);
    } catch (error) {
      message.error('加载溯源记录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingRecord(null);
    form.resetFields();
    form.setFieldsValue({
      traceDate: dayjs(),
      specimenId: Number(specimenId)
    });
    setModalVisible(true);
  };

  const handleEdit = (record: TraceabilityRecord) => {
    setEditingRecord(record);
    form.setFieldsValue({
      ...record,
      traceDate: dayjs(record.traceDate),
      latitude: record.latitude ? Number(record.latitude) : undefined,
      longitude: record.longitude ? Number(record.longitude) : undefined
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await traceabilityService.deleteTraceRecord(id);
      message.success('删除成功');
      loadRecords();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const data = {
        ...values,
        traceDate: values.traceDate.toISOString(),
        specimenId: Number(specimenId),
        latitude: values.latitude !== undefined ? String(values.latitude) : null,
        longitude: values.longitude !== undefined ? String(values.longitude) : null
      };

      if (editingRecord) {
        await traceabilityService.updateTraceRecord(editingRecord.id, data);
        message.success('更新成功');
      } else {
        await traceabilityService.createTraceRecord(data);
        message.success('创建成功');
      }

      setModalVisible(false);
      loadRecords();
    } catch (error) {
      message.error(editingRecord ? '更新失败' : '创建失败');
    }
  };

  const getTraceTypeLabel = (type: TraceType) => {
    const labels: Record<TraceType, string> = {
      [TraceType.COLLECTION]: '采集',
      [TraceType.TRANSPORT]: '运输',
      [TraceType.PROCESSING]: '处理',
      [TraceType.STORAGE]: '入库',
      [TraceType.EXHIBITION]: '展出',
      [TraceType.RESEARCH]: '研究',
      [TraceType.RESTORATION]: '修复',
      [TraceType.OTHER]: '其他'
    };
    return labels[type] || type;
  };

  const getTraceTypeColor = (type: TraceType) => {
    const colors: Record<TraceType, string> = {
      [TraceType.COLLECTION]: 'green',
      [TraceType.TRANSPORT]: 'blue',
      [TraceType.PROCESSING]: 'orange',
      [TraceType.STORAGE]: 'purple',
      [TraceType.EXHIBITION]: 'cyan',
      [TraceType.RESEARCH]: 'magenta',
      [TraceType.RESTORATION]: 'gold',
      [TraceType.OTHER]: 'gray'
    };
    return colors[type] || 'blue';
  };

  const { validMapRecords, invalidCount, center, polylinePositions } = useMemo(() => {
    const valid = records.filter((r) => isValidCoordinate(r.latitude, r.longitude));
    const invalid = records.length - valid.length;
    
    const defaultCenter: [number, number] = [30.0, 120.0];
    const mapCenter: [number, number] =
      valid.length > 0
        ? [Number(valid[0].latitude), Number(valid[0].longitude)]
        : defaultCenter;

    const polyline: [number, number][] = valid.map((r) => [
      Number(r.latitude),
      Number(r.longitude)
    ]);

    return {
      validMapRecords: valid,
      invalidCount: invalid,
      center: mapCenter,
      polylinePositions: polyline
    };
  }, [records]);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/specimens/${specimenId}`)}>
          返回标本详情
        </Button>
        {isCurator(user?.role) && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加记录
          </Button>
        )}
      </Space>

      {invalidCount > 0 && (
        <Alert
          message={`有 ${invalidCount} 条溯源记录缺少有效坐标信息，无法在地图上显示`}
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
        />
      )}

      <Card loading={loading}>
        <Title level={4} style={{ marginBottom: 16 }}>
          {specimenName} - 生态溯源轨迹
        </Title>

        <Row gutter={[24, 24]}>
          <Col xs={24} lg={14}>
            <Card 
              title="溯源地图" 
              size="small"
              extra={
                <span style={{ fontSize: 12, color: '#666' }}>
                  <EnvironmentOutlined /> 有效坐标点: {validMapRecords.length} / {records.length}
                </span>
              }
            >
              {validMapRecords.length > 0 ? (
                <div style={{ position: 'relative', height: 500, width: '100%' }}>
                  <MapContainer
                    center={center}
                    zoom={5}
                    style={{ height: '100%', width: '100%', borderRadius: 8 }}
                    key={validMapRecords.length}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      maxZoom={18}
                    />
                    <MapController center={center} records={validMapRecords} />
                    {polylinePositions.length > 1 && (
                      <Polyline
                        positions={polylinePositions}
                        pathOptions={{
                          color: '#1890ff',
                          weight: 3,
                          opacity: 0.8,
                          dashArray: '10, 10'
                        }}
                      />
                    )}
                    {validMapRecords.map((record, index) => (
                      <Marker
                        key={record.id}
                        position={[Number(record.latitude), Number(record.longitude)]}
                        icon={customIcon}
                        zIndexOffset={index * 100}
                      >
                        <Popup>
                          <div style={{ minWidth: 200 }}>
                            <strong style={{ fontSize: 14 }}>{record.title}</strong>
                            <div style={{ margin: '4px 0' }}>
                              <Tag color={getTraceTypeColor(record.traceType)}>
                                {getTraceTypeLabel(record.traceType)}
                              </Tag>
                              <Tag color="blue">#{index + 1}</Tag>
                            </div>
                            {record.location && (
                              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                                <EnvironmentOutlined /> {record.location}
                              </div>
                            )}
                            <div style={{ fontSize: 12, color: '#888' }}>
                              {dayjs(record.traceDate).format('YYYY-MM-DD HH:mm')}
                            </div>
                            {record.description && (
                              <div style={{ fontSize: 12, marginTop: 8, paddingTop: 8, borderTop: '1px solid #eee' }}>
                                {record.description}
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              ) : (
                <Empty 
                  description={
                    <div>
                      <p>暂无带坐标的溯源记录</p>
                      <p style={{ fontSize: 12, color: '#999' }}>添加溯源记录时填写经纬度可在地图上显示</p>
                    </div>
                  } 
                  style={{ padding: 100 }} 
                />
              )}
            </Card>
          </Col>

          <Col xs={24} lg={10}>
            <Card 
              title="溯源时间线" 
              size="small"
              extra={
                <span style={{ fontSize: 12, color: '#666' }}>
                  共 {records.length} 条记录
                </span>
              }
            >
              {records.length > 0 ? (
                <Timeline
                  mode="left"
                  items={records.map((record, index) => ({
                    color: isValidCoordinate(record.latitude, record.longitude) 
                      ? getTraceTypeColor(record.traceType) 
                      : 'gray',
                    dot: isValidCoordinate(record.latitude, record.longitude) 
                      ? <EnvironmentOutlined /> 
                      : <WarningOutlined />,
                    label: (
                      <div>
                        <div>{dayjs(record.traceDate).format('YYYY-MM-DD')}</div>
                        {!isValidCoordinate(record.latitude, record.longitude) && (
                          <div style={{ fontSize: 11, color: '#faad14' }}>
                            无有效坐标
                          </div>
                        )}
                      </div>
                    ),
                    children: (
                      <div style={{ marginBottom: 16 }}>
                        <Space style={{ marginBottom: 4 }} wrap>
                          <strong>{record.title}</strong>
                          <Tag color={getTraceTypeColor(record.traceType)} size="small">
                            {getTraceTypeLabel(record.traceType)}
                          </Tag>
                          <Tag color="blue" size="small">#{index + 1}</Tag>
                        </Space>
                        {record.location && (
                          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                            <EnvironmentOutlined /> {record.location}
                          </div>
                        )}
                        {record.operator && (
                          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                            操作人: {record.operator}
                          </div>
                        )}
                        {record.description && (
                          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                            {record.description}
                          </div>
                        )}
                        {isCurator(user?.role) && (
                          <Space style={{ marginTop: 8 }}>
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => handleEdit(record)}
                            >
                              编辑
                            </Button>
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => handleDelete(record.id)}
                            >
                              删除
                            </Button>
                          </Space>
                        )}
                      </div>
                    )
                  }))}
                />
              ) : (
                <Empty description="暂无溯源记录" style={{ padding: 50 }} />
              )}
            </Card>
          </Col>
        </Row>
      </Card>

      <Modal
        title={editingRecord ? '编辑溯源记录' : '添加溯源记录'}
        open={modalVisible}
        onOk={form.submit}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="traceType"
                label="记录类型"
                rules={[{ required: true, message: '请选择类型' }]}
              >
                <Select placeholder="请选择类型">
                  <Option value={TraceType.COLLECTION}>采集</Option>
                  <Option value={TraceType.TRANSPORT}>运输</Option>
                  <Option value={TraceType.PROCESSING}>处理</Option>
                  <Option value={TraceType.STORAGE}>入库</Option>
                  <Option value={TraceType.EXHIBITION}>展出</Option>
                  <Option value={TraceType.RESEARCH}>研究</Option>
                  <Option value={TraceType.RESTORATION}>修复</Option>
                  <Option value={TraceType.OTHER}>其他</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="traceDate"
                label="日期"
                rules={[{ required: true, message: '请选择日期' }]}
              >
                <DatePicker style={{ width: '100%' }} showTime />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="请输入标题" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="请输入描述" />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="location" label="地点">
                <Input placeholder="请输入地点名称" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="operator" label="操作人">
                <Input placeholder="请输入操作人" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item 
                name="latitude" 
                label="纬度"
                tooltip="范围: -90 到 90，例如: 30.123456"
              >
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="纬度 (-90 ~ 90)"
                  min={-90}
                  max={90}
                  step={0.000001}
                  precision={6}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item 
                name="longitude" 
                label="经度"
                tooltip="范围: -180 到 180，例如: 120.654321"
              >
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="经度 (-180 ~ 180)"
                  min={-180}
                  max={180}
                  step={0.000001}
                  precision={6}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="temperature" label="温度(°C)">
                <Input placeholder="温度" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="humidity" label="湿度(%)">
                <Input placeholder="湿度" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remarks" label="备注">
            <Input.TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TraceabilityMap;
