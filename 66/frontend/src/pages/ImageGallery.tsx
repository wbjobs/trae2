import { useEffect, useState } from 'react';
import {
  Row,
  Col,
  Card,
  Image,
  Select,
  Button,
  Space,
  Modal,
  Form,
  Input,
  DatePicker,
  Popconfirm,
  message,
  Upload,
  Empty,
  Tag
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  UploadOutlined,
  EnvironmentOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { imageApi, resourceApi } from '../services/api';
import { FieldImage, Resource } from '../types';
import { getImageUrl } from '../utils/format';

const { Option } = Select;

const ImageGallery = () => {
  const [images, setImages] = useState<FieldImage[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedResource, setSelectedResource] = useState<string | undefined>();
  const [editingImage, setEditingImage] = useState<FieldImage | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadResourceId, setUploadResourceId] = useState<string>('');
  const [pendingFiles, setPendingFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadResources();
  }, []);

  useEffect(() => {
    loadImages();
  }, [selectedResource]);

  const loadResources = async () => {
    try {
      const response = await resourceApi.getAll({ page_size: 1000 });
      if (response.success) {
        setResources(response.data);
      }
    } catch (error) {
      message.error('加载资源列表失败');
    }
  };

  const loadImages = async () => {
    setLoading(true);
    try {
      const response = await imageApi.getAll({
        resource_id: selectedResource,
        page_size: 1000
      });
      setImages(response.data);
    } catch (error) {
      message.error('加载影像列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (image: FieldImage) => {
    setEditingImage(image);
    form.setFieldsValue({
      ...image,
      taken_date: image.taken_date ? dayjs(image.taken_date) : null
    });
    setEditModalVisible(true);
  };

  const handleEditSubmit = async () => {
    try {
      const values = await form.validateFields();
      const submitData = {
        ...values,
        taken_date: values.taken_date ? values.taken_date.format('YYYY-MM-DD') : null
      };

      const response = await imageApi.update(editingImage!.id, submitData);
      if (response.success) {
        message.success('更新成功');
        setEditModalVisible(false);
        loadImages();
      }
    } catch (error) {
      if (error.errorFields) return;
      message.error('更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await imageApi.delete(id);
      if (response.success) {
        message.success('删除成功');
        loadImages();
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleUpload = async () => {
    if (!uploadResourceId) {
      message.warning('请选择关联的种质资源');
      return;
    }

    if (pendingFiles.length === 0) {
      message.warning('请选择要上传的图片');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('resource_id', uploadResourceId);

      const descriptions: string[] = [];
      pendingFiles.forEach((file) => {
        formData.append('images', file.originFileObj || file);
        descriptions.push(file.description || '');
      });
      formData.append('descriptions', JSON.stringify(descriptions));

      const response = await imageApi.upload(formData);
      if (response.success) {
        message.success(`成功上传 ${response.data.length} 张影像`);
        setUploadModalVisible(false);
        setPendingFiles([]);
        setUploadResourceId('');
        loadImages();
      }
    } catch (error) {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  const getResourceName = (resourceId: string) => {
    const resource = resources.find(r => r.id === resourceId);
    return resource ? `${resource.name} (${resource.scientific_name})` : '-';
  };

  return (
    <div>
      <Card>
        <div className="table-toolbar">
          <Space>
            <Select
              placeholder="选择种质资源筛选"
              allowClear
              style={{ width: 250 }}
              value={selectedResource}
              onChange={setSelectedResource}
              showSearch
              optionFilterProp="children"
            >
              {resources.map(res => (
                <Option key={res.id} value={res.id}>
                  {res.name} - {res.scientific_name}
                </Option>
              ))}
            </Select>
          </Space>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={() => setUploadModalVisible(true)}
          >
            上传影像
          </Button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>
        ) : images.length === 0 ? (
          <Empty description="暂无影像资料" />
        ) : (
          <Row gutter={[16, 16]}>
            {images.map(image => (
              <Col xs={24} sm={12} md={8} lg={6} key={image.id}>
                <Card
                  hoverable
                  cover={
                    <Image
                      src={getImageUrl(image.file_name)}
                      alt={image.description || image.original_name}
                      style={{ height: 200, objectFit: 'cover' }}
                      fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23f5f5f5' width='100' height='100'/%3E%3Ctext fill='%23999' font-family='Arial' font-size='12' x='50' y='50' text-anchor='middle' dominant-baseline='middle'%3E无预览%3C/text%3E%3C/svg%3E"
                    />
                  }
                  actions={[
                    <Button
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEdit(image)}
                    >
                      编辑
                    </Button>,
                    <Popconfirm
                      title="确定删除该影像？"
                      onConfirm={() => handleDelete(image.id)}
                    >
                      <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                        删除
                      </Button>
                    </Popconfirm>
                  ]}
                >
                  <Card.Meta
                    title={image.description || image.original_name}
                    description={
                      <div style={{ fontSize: 12 }}>
                        <div style={{ marginBottom: 4 }}>
                          <Tag color="green">{getResourceName(image.resource_id)}</Tag>
                        </div>
                        {image.taken_date && (
                          <div>拍摄: {dayjs(image.taken_date).format('YYYY-MM-DD')}</div>
                        )}
                        {image.location && (
                          <div>
                            <EnvironmentOutlined style={{ marginRight: 4 }} />
                            {image.location}
                          </div>
                        )}
                        {image.photographer && <div>拍摄人: {image.photographer}</div>}
                      </div>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      <Modal
        title="编辑影像信息"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        onOk={handleEditSubmit}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="taken_date" label="拍摄日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="location" label="拍摄地点">
            <Input />
          </Form.Item>
          <Form.Item name="photographer" label="拍摄人">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="上传野外影像"
        open={uploadModalVisible}
        onCancel={() => {
          setUploadModalVisible(false);
          setPendingFiles([]);
          setUploadResourceId('');
        }}
        onOk={handleUpload}
        okText="上传"
        cancelText="取消"
        confirmLoading={uploading}
        width={600}
      >
        <Form layout="vertical">
          <Form.Item label="关联种质资源" required>
            <Select
              placeholder="请选择关联的种质资源"
              value={uploadResourceId}
              onChange={setUploadResourceId}
              showSearch
              optionFilterProp="children"
              style={{ width: '100%' }}
            >
              {resources.map(res => (
                <Option key={res.id} value={res.id}>
                  {res.name} - {res.scientific_name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="选择图片" required>
            <Upload
              multiple
              listType="picture-card"
              beforeUpload={() => false}
              onChange={(info) => setPendingFiles(info.fileList)}
              accept="image/*"
              maxCount={10}
            >
              <div>
                <UploadOutlined />
                <div style={{ marginTop: 8 }}>选择图片</div>
              </div>
            </Upload>
            <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
              支持 JPEG、PNG、GIF 格式，单张不超过 10MB，最多同时上传 10 张
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ImageGallery;
