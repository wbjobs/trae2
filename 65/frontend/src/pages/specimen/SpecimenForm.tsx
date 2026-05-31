import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Space,
  Row,
  Col,
  DatePicker,
  InputNumber,
  message,
  Typography
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { specimenService } from '../../services/specimen.service';
import { Specimen, SpecimenStatus } from '../../types';
import dayjs from 'dayjs';

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const SpecimenForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const isEdit = !!id;

  useEffect(() => {
    if (isEdit) {
      loadSpecimen();
    }
  }, [id]);

  const loadSpecimen = async () => {
    setLoading(true);
    try {
      const result = await specimenService.getSpecimen(Number(id));
      const specimen = result.specimen;
      form.setFieldsValue({
        ...specimen,
        collectionDate: specimen.collectionDate ? dayjs(specimen.collectionDate) : null
      });
    } catch (error) {
      message.error('加载标本信息失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    setSubmitLoading(true);
    try {
      const data = {
        ...values,
        collectionDate: values.collectionDate ? values.collectionDate.toISOString() : null
      };

      if (isEdit) {
        await specimenService.updateSpecimen(Number(id), data);
        message.success('更新成功');
      } else {
        await specimenService.createSpecimen({
          ...data,
          status: SpecimenStatus.PENDING
        });
        message.success('创建成功');
      }

      navigate('/specimens');
    } catch (error) {
      message.error(isEdit ? '更新失败' : '创建失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const categories = ['鱼类', '贝类', '甲壳类', '珊瑚类', '藻类', '哺乳类', '爬行类', '其他'];
  const phylums = ['脊索动物门', '软体动物门', '节肢动物门', '刺胞动物门', '褐藻门', '红藻门', '绿藻门', '其他'];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/specimens')}>
          返回列表
        </Button>
      </Space>

      <Card loading={loading}>
        <Title level={4} style={{ marginBottom: 24 }}>
          {isEdit ? '编辑标本' : '新增标本'}
        </Title>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ status: SpecimenStatus.PENDING }}
        >
          <Card title="基本信息" size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item
                  name="specimenNo"
                  label="标本编号"
                  rules={[{ required: true, message: '请输入标本编号' }]}
                >
                  <Input placeholder="请输入标本编号" disabled={isEdit} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  name="name"
                  label="中文名称"
                  rules={[{ required: true, message: '请输入中文名称' }]}
                >
                  <Input placeholder="请输入中文名称" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  name="scientificName"
                  label="学名"
                  rules={[{ required: true, message: '请输入学名' }]}
                >
                  <Input placeholder="请输入学名" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="commonName" label="俗名">
                  <Input placeholder="请输入俗名" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  name="category"
                  label="分类"
                  rules={[{ required: true, message: '请选择分类' }]}
                >
                  <Select placeholder="请选择分类">
                    {categories.map((cat) => (
                      <Option key={cat} value={cat}>
                        {cat}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="phylum" label="门">
                  <Select placeholder="请选择门" allowClear>
                    {phylums.map((p) => (
                      <Option key={p} value={p}>
                        {p}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} md={6}>
                <Form.Item name="class" label="纲">
                  <Input placeholder="请输入纲" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="order" label="目">
                  <Input placeholder="请输入目" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="family" label="科">
                  <Input placeholder="请输入科" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="genus" label="属">
                  <Input placeholder="请输入属" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} md={6}>
                <Form.Item name="species" label="种">
                  <Input placeholder="请输入种" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="description" label="描述">
              <TextArea rows={3} placeholder="请输入描述" />
            </Form.Item>
          </Card>

          <Card title="采集信息" size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="collectionDate" label="采集日期">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="collectionLocation" label="采集地点">
                  <Input placeholder="请输入采集地点" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="collector" label="采集人">
                  <Input placeholder="请输入采集人" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} md={6}>
                <Form.Item name="collectionLatitude" label="纬度">
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="纬度"
                    min={-90}
                    max={90}
                    step={0.000001}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="collectionLongitude" label="经度">
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="经度"
                    min={-180}
                    max={180}
                    step={0.000001}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="depth" label="采集深度(m)">
                  <Input placeholder="请输入采集深度" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="waterTemperature" label="水温(°C)">
                  <Input placeholder="请输入水温" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="salinity" label="盐度(‰)">
                  <Input placeholder="请输入盐度" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card title="形态特征" size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col xs={24} md={6}>
                <Form.Item name="size" label="尺寸">
                  <Input placeholder="请输入尺寸" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="weight" label="重量">
                  <Input placeholder="请输入重量" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="color" label="颜色">
                  <Input placeholder="请输入颜色" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="features" label="特征描述">
              <TextArea rows={3} placeholder="请输入特征描述" />
            </Form.Item>
          </Card>

          <Card title="生态信息" size="small" style={{ marginBottom: 16 }}>
            <Form.Item name="habitat" label="栖息地">
              <TextArea rows={2} placeholder="请输入栖息地信息" />
            </Form.Item>
            <Form.Item name="distribution" label="分布区域">
              <TextArea rows={2} placeholder="请输入分布区域" />
            </Form.Item>
          </Card>

          <Card title="馆藏信息" size="small" style={{ marginBottom: 24 }}>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="storageLocation" label="存放位置">
                  <Input placeholder="请输入存放位置" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="tags" label="标签">
                  <Input placeholder="多个标签用逗号分隔" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="remarks" label="备注">
              <TextArea rows={2} placeholder="请输入备注" />
            </Form.Item>
          </Card>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={submitLoading}
              >
                {isEdit ? '保存修改' : '创建标本'}
              </Button>
              <Button onClick={() => navigate('/specimens')}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default SpecimenForm;
