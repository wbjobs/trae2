import { useEffect, useState } from 'react';
import {
  Form,
  Input,
  Select,
  Button,
  Card,
  Row,
  Col,
  InputNumber,
  DatePicker,
  message,
  Space,
  Steps,
  Divider,
  Upload,
  Image,
  Tooltip
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  EnvironmentOutlined,
  UploadOutlined,
  DeleteOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { resourceApi, categoryApi, imageApi } from '../services/api';
import { Resource, Category, FieldImage } from '../types';
import { getImageUrl } from '../utils/format';

const { TextArea } = Input;
const { Option } = Select;

const ResourceForm = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<FieldImage[]>([]);
  const [pendingImages, setPendingImages] = useState<any[]>([]);

  const isEdit = !!id;

  useEffect(() => {
    loadCategories();
    if (isEdit) {
      loadResourceData();
    }
  }, [id]);

  const loadCategories = async () => {
    try {
      const response = await categoryApi.getAll();
      if (response.success) {
        setCategories(response.data);
      }
    } catch (error) {
      message.error('加载分类数据失败');
    }
  };

  const loadResourceData = async () => {
    try {
      const response = await resourceApi.getById(id!);
      if (response.success) {
        const data = response.data;
        form.setFieldsValue({
          ...data,
          survey_date: data.survey_date ? dayjs(data.survey_date) : null
        });
        setUploadedImages(data.images);
      }
    } catch (error) {
      message.error('加载资源数据失败');
    }
  };

  const handleGeocode = async () => {
    const latitude = form.getFieldValue('latitude');
    const longitude = form.getFieldValue('longitude');

    if (!latitude || !longitude) {
      message.warning('请先填写经纬度坐标');
      return;
    }

    setGeocoding(true);
    try {
      const response = await resourceApi.geocode({ latitude, longitude });
      if (response.success && response.data) {
        const { province, city, district, formatted_address } = response.data;
        if (!form.getFieldValue('province') && province) {
          form.setFieldValue('province', province);
        }
        if (!form.getFieldValue('city') && city) {
          form.setFieldValue('city', city);
        }
        if (!form.getFieldValue('district') && district) {
          form.setFieldValue('district', district);
        }
        if (!form.getFieldValue('address') && formatted_address) {
          form.setFieldValue('address', formatted_address);
        }
        message.success('地理编码成功');
      } else {
        message.info('地理编码服务暂不可用，请手动填写地址信息');
      }
    } catch (error) {
      message.error('地理编码失败');
    } finally {
      setGeocoding(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const submitData: any = {};
      Object.keys(values).forEach(key => {
        const value = values[key];
        if (value === undefined || value === '' || value === null) {
          submitData[key] = null;
        } else {
          submitData[key] = value;
        }
      });

      submitData.survey_date = values.survey_date ? values.survey_date.format('YYYY-MM-DD') : null;

      let response;

      if (isEdit) {
        response = await resourceApi.update(id!, submitData);
      } else {
        response = await resourceApi.create(submitData);
      }

      if (response.success) {
        message.success(isEdit ? '更新成功' : '创建成功');

        if (pendingImages.length > 0 && response.data?.id) {
          const formData = new FormData();
          formData.append('resource_id', response.data.id);

          const descriptions: string[] = [];
          const files: File[] = [];

          pendingImages.forEach((img) => {
            const file = img.file;
            if (file && file !== 'removed') {
              files.push(file);
              descriptions.push(img.description || '');
            }
          });

          if (files.length > 0) {
            files.forEach(file => formData.append('images', file));
            formData.append('descriptions', JSON.stringify(descriptions));

            try {
              await imageApi.upload(formData);
              message.success('影像上传成功');
            } catch (error) {
              message.warning('影像上传失败，请稍后在详情页上传');
            }
          }
        }

        navigate(`/resources/${response.data?.id}`);
      }
    } catch (error: any) {
      if (error.errorFields) return;
      message.error((isEdit ? '更新失败' : '创建失败') + ': ' + (error.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (info: any) => {
    const newFiles = info.fileList
      .filter((file: any) => file.status !== 'removed')
      .map((file: any) => ({
        file: file.originFileObj || file,
        description: file.description || '',
        uid: file.uid
      }));
    setPendingImages(newFiles);
  };

  const handleRemoveImage = (imageId: string, isUploaded: boolean) => {
    if (isUploaded) {
      setUploadedImages(prev => prev.filter(img => img.id !== imageId));
    } else {
      setPendingImages(prev => prev.filter(img => img.uid !== imageId));
    }
  };

  const mainCategories = categories.filter(c => !c.parent_id);
  const subCategories = categories.filter(c => c.parent_id);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/resources')}>
          返回列表
        </Button>
        <h2 style={{ margin: 0 }}>{isEdit ? '编辑种质资源' : '新增种质资源'}</h2>
      </Space>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ protection_level: null }}
      >
        <Card title="基本信息" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="name"
                label="中文名称"
                rules={[{ required: true, message: '请输入中文名称' }]}
              >
                <Input placeholder="如：银杏" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="scientific_name"
                label="拉丁学名"
                rules={[{ required: true, message: '请输入拉丁学名' }]}
              >
                <Input placeholder="如：Ginkgo biloba" style={{ fontStyle: 'italic' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="family" label="科">
                <Input placeholder="如：银杏科" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="genus" label="属">
                <Input placeholder="如：银杏属" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="species" label="种">
                <Input placeholder="如：银杏" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="category_id" label="资源分类">
                <Select placeholder="请选择分类" allowClear>
                  {mainCategories.map(cat => (
                    <Option key={cat.id} value={cat.id}>{cat.name}</Option>
                  ))}
                  {subCategories.map(cat => (
                    <Option key={cat.id} value={cat.id}>
                      &nbsp;&nbsp;&nbsp;└ {cat.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="protection_level" label="保护等级">
                <Select placeholder="请选择保护等级" allowClear>
                  <Option value="国家一级保护">国家一级保护</Option>
                  <Option value="国家二级保护">国家二级保护</Option>
                  <Option value="省级保护">省级保护</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="形态特征描述">
            <TextArea rows={4} placeholder="请输入形态特征描述..." />
          </Form.Item>
        </Card>

        <Card title="地理分布" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="latitude" label="纬度">
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="如：31.2304"
                  min={-90}
                  max={90}
                  step={0.0001}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="longitude" label="经度">
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="如：121.4737"
                  min={-180}
                  max={180}
                  step={0.0001}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="altitude" label="海拔(m)">
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="如：500"
                  min={-500}
                  max={9000}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Tooltip title="根据经纬度自动获取地址信息">
              <Button
                icon={<EnvironmentOutlined />}
                onClick={handleGeocode}
                loading={geocoding}
              >
                地理编码获取地址
              </Button>
            </Tooltip>
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="province" label="省/直辖市">
                <Input placeholder="如：上海市" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="city" label="市">
                <Input placeholder="如：上海市" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="district" label="区/县">
                <Input placeholder="如：浦东新区" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="address" label="详细地址">
            <Input placeholder="如：浦东新区xxx路xxx号" />
          </Form.Item>
        </Card>

        <Card title="生境与调查信息" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="origin" label="原产地">
                <Input placeholder="如：中国" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="habitat" label="生境描述">
                <Input placeholder="如：海拔500-1000米的天然林中" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="surveyor" label="调查人">
                <Input placeholder="如：张调查" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="survey_date" label="调查日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card title="野外影像" style={{ marginBottom: 16 }}>
          {uploadedImages.length > 0 && (
            <>
              <h4>已上传影像</h4>
              <div className="image-upload-list" style={{ marginBottom: 16 }}>
                {uploadedImages.map(image => (
                  <div key={image.id} className="image-item">
                    <Image
                      src={getImageUrl(image.file_name)}
                      alt={image.description || image.original_name}
                      width={100}
                      height={100}
                      style={{ objectFit: 'cover' }}
                      fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23f5f5f5' width='100' height='100'/%3E%3Ctext fill='%23999' font-family='Arial' font-size='12' x='50' y='50' text-anchor='middle' dominant-baseline='middle'%3E无预览%3C/text%3E%3C/svg%3E"
                    />
                    <div
                      className="image-delete"
                      onClick={() => handleRemoveImage(image.id, true)}
                    >
                      ×
                    </div>
                  </div>
                ))}
              </div>
              <Divider />
            </>
          )}

          <Upload
            multiple
            listType="picture-card"
            beforeUpload={() => false}
            onChange={handleImageChange}
            accept="image/*"
            maxCount={10}
          >
            <div>
              <PlusOutlined />
              <div style={{ marginTop: 8 }}>选择图片</div>
            </div>
          </Upload>
          <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
            支持 JPEG、PNG、GIF 格式，单张不超过 10MB
          </div>
        </Card>

        <Form.Item>
          <Space>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              htmlType="submit"
              loading={loading}
              size="large"
            >
              {isEdit ? '保存修改' : '创建资源'}
            </Button>
            <Button size="large" onClick={() => navigate('/resources')}>
              取消
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </div>
  );
};

export default ResourceForm;
