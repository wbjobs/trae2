import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Button,
  Space,
  Tag,
  Image,
  Row,
  Col,
  Divider,
  Typography,
  Timeline,
  message
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  CameraOutlined,
  EnvironmentOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { specimenService, traceabilityService } from '../../services/specimen.service';
import { Specimen, SpecimenStatus, TraceType } from '../../types';
import { useAuthStore, isCurator } from '../../store/authStore';
import dayjs from 'dayjs';

const { Title } = Typography;

const SpecimenDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [specimen, setSpecimen] = useState<Specimen | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (id) {
      loadSpecimen();
    }
  }, [id]);

  const loadSpecimen = async () => {
    setLoading(true);
    try {
      const result = await specimenService.getSpecimen(Number(id));
      setSpecimen(result.specimen);
    } catch (error) {
      console.error('加载标本详情失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    try {
      await specimenService.verifySpecimen(Number(id));
      message.success('审核成功');
      loadSpecimen();
    } catch (error) {
      message.error('审核失败');
    }
  };

  const getStatusTag = (status: SpecimenStatus) => {
    const statusMap = {
      [SpecimenStatus.PENDING]: { color: 'orange', text: '待审核' },
      [SpecimenStatus.VERIFIED]: { color: 'green', text: '已审核' },
      [SpecimenStatus.ARCHIVED]: { color: 'blue', text: '已归档' }
    };
    const config = statusMap[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const getTraceTypeIcon = (type: TraceType) => {
    const icons: Record<TraceType, React.ReactNode> = {
      [TraceType.COLLECTION]: <EnvironmentOutlined />,
      [TraceType.TRANSPORT]: <EnvironmentOutlined />,
      [TraceType.PROCESSING]: <EnvironmentOutlined />,
      [TraceType.STORAGE]: <EnvironmentOutlined />,
      [TraceType.EXHIBITION]: <EnvironmentOutlined />,
      [TraceType.RESEARCH]: <EnvironmentOutlined />,
      [TraceType.RESTORATION]: <EnvironmentOutlined />,
      [TraceType.OTHER]: <EnvironmentOutlined />
    };
    return icons[type] || <EnvironmentOutlined />;
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

  if (!specimen) {
    return <div>加载中...</div>;
  }

  const primaryImage = specimen.images?.find((img) => img.isPrimary) || specimen.images?.[0];
  const otherImages = specimen.images?.filter((img) => img.id !== primaryImage?.id) || [];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/specimens')}>
          返回列表
        </Button>
        {isCurator(user?.role) && (
          <>
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => navigate(`/specimens/${id}/edit`)}
            >
              编辑
            </Button>
            {specimen.status === SpecimenStatus.PENDING && (
              <Button icon={<CheckCircleOutlined />} onClick={handleVerify}>
                审核通过
              </Button>
            )}
          </>
        )}
        <Button icon={<CameraOutlined />} onClick={() => navigate(`/images/${id}`)}>
          影像预览
        </Button>
        <Button icon={<EnvironmentOutlined />} onClick={() => navigate(`/traceability/${id}`)}>
          生态溯源
        </Button>
      </Space>

      <Card loading={loading}>
        <Space style={{ marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>
            {specimen.name}
          </Title>
          {getStatusTag(specimen.status)}
        </Space>

        <Row gutter={[24, 24]}>
          <Col xs={24} lg={8}>
            <Card title="标本图片" size="small">
              {primaryImage ? (
                <div style={{ textAlign: 'center' }}>
                  <Image
                    src={primaryImage.fileUrl}
                    alt={specimen.name}
                    style={{ maxWidth: '100%', maxHeight: 300, objectFit: 'contain' }}
                    preview
                  />
                  {otherImages.length > 0 && (
                    <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {otherImages.slice(0, 4).map((img) => (
                        <Image
                          key={img.id}
                          width={60}
                          height={60}
                          src={img.fileUrl}
                          style={{ objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                          preview
                        />
                      ))}
                      {otherImages.length > 4 && (
                        <div
                          style={{
                            width: 60,
                            height: 60,
                            background: '#f0f0f0',
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 14,
                            color: '#666'
                          }}
                        >
                          +{otherImages.length - 4}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
                  暂无图片
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24} lg={16}>
            <Card title="基本信息" size="small">
              <Descriptions column={2} size="small">
                <Descriptions.Item label="标本编号">{specimen.specimenNo}</Descriptions.Item>
                <Descriptions.Item label="中文名称">{specimen.name}</Descriptions.Item>
                <Descriptions.Item label="学名" span={2}>
                  <i>{specimen.scientificName}</i>
                </Descriptions.Item>
                {specimen.commonName && (
                  <Descriptions.Item label="俗名">{specimen.commonName}</Descriptions.Item>
                )}
                <Descriptions.Item label="分类">{specimen.category}</Descriptions.Item>
                {specimen.phylum && <Descriptions.Item label="门">{specimen.phylum}</Descriptions.Item>}
                {specimen.class && <Descriptions.Item label="纲">{specimen.class}</Descriptions.Item>}
                {specimen.order && <Descriptions.Item label="目">{specimen.order}</Descriptions.Item>}
                {specimen.family && <Descriptions.Item label="科">{specimen.family}</Descriptions.Item>}
                {specimen.genus && <Descriptions.Item label="属">{specimen.genus}</Descriptions.Item>}
                {specimen.species && <Descriptions.Item label="种">{specimen.species}</Descriptions.Item>}
              </Descriptions>
            </Card>
          </Col>
        </Row>

        <Divider />

        <Row gutter={[24, 24]}>
          <Col xs={24} md={12}>
            <Card title="采集信息" size="small">
              <Descriptions column={1} size="small">
                {specimen.collectionDate && (
                  <Descriptions.Item label="采集日期">
                    {dayjs(specimen.collectionDate).format('YYYY-MM-DD')}
                  </Descriptions.Item>
                )}
                {specimen.collectionLocation && (
                  <Descriptions.Item label="采集地点">{specimen.collectionLocation}</Descriptions.Item>
                )}
                {specimen.collector && (
                  <Descriptions.Item label="采集人">{specimen.collector}</Descriptions.Item>
                )}
                {specimen.depth && <Descriptions.Item label="采集深度">{specimen.depth}</Descriptions.Item>}
                {specimen.waterTemperature && (
                  <Descriptions.Item label="水温">{specimen.waterTemperature}</Descriptions.Item>
                )}
                {specimen.salinity && <Descriptions.Item label="盐度">{specimen.salinity}</Descriptions.Item>}
              </Descriptions>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card title="形态特征" size="small">
              <Descriptions column={1} size="small">
                {specimen.size && <Descriptions.Item label="尺寸">{specimen.size}</Descriptions.Item>}
                {specimen.weight && <Descriptions.Item label="重量">{specimen.weight}</Descriptions.Item>}
                {specimen.color && <Descriptions.Item label="颜色">{specimen.color}</Descriptions.Item>}
                {specimen.features && (
                  <Descriptions.Item label="特征描述">{specimen.features}</Descriptions.Item>
                )}
              </Descriptions>
            </Card>
          </Col>
        </Row>

        <Divider />

        <Row gutter={[24, 24]}>
          <Col xs={24} md={12}>
            <Card title="生态信息" size="small">
              <Descriptions column={1} size="small">
                {specimen.habitat && <Descriptions.Item label="栖息地">{specimen.habitat}</Descriptions.Item>}
                {specimen.distribution && (
                  <Descriptions.Item label="分布区域">{specimen.distribution}</Descriptions.Item>
                )}
              </Descriptions>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card title="馆藏信息" size="small">
              <Descriptions column={1} size="small">
                {specimen.storageLocation && (
                  <Descriptions.Item label="存放位置">{specimen.storageLocation}</Descriptions.Item>
                )}
                {specimen.remarks && <Descriptions.Item label="备注">{specimen.remarks}</Descriptions.Item>}
                <Descriptions.Item label="创建时间">
                  {dayjs(specimen.createdAt).format('YYYY-MM-DD HH:mm')}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>

        {specimen.traceabilityRecords && specimen.traceabilityRecords.length > 0 && (
          <>
            <Divider />
            <Card title="溯源记录" size="small">
              <Timeline
                items={specimen.traceabilityRecords.slice(0, 5).map((record) => ({
                  color: getTraceTypeColor(record.traceType),
                  dot: getTraceTypeIcon(record.traceType),
                  children: (
                    <div>
                      <Space>
                        <strong>{record.title}</strong>
                        <Tag color={getTraceTypeColor(record.traceType)}>{record.traceType}</Tag>
                      </Space>
                      <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                        {record.location && <span>地点: {record.location} | </span>}
                        {record.operator && <span>操作人: {record.operator} | </span>}
                        {dayjs(record.traceDate).format('YYYY-MM-DD HH:mm')}
                      </div>
                      {record.description && (
                        <div style={{ marginTop: 8, color: '#888' }}>{record.description}</div>
                      )}
                    </div>
                  )
                }))}
              />
              {specimen.traceabilityRecords.length > 5 && (
                <Button type="link" onClick={() => navigate(`/traceability/${id}`)}>
                  查看全部溯源记录
                </Button>
              )}
            </Card>
          </>
        )}
      </Card>
    </div>
  );
};

export default SpecimenDetail;
