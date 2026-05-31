import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Space,
  Upload,
  message,
  Row,
  Col,
  Typography,
  Modal,
  Form,
  Input,
  Select,
  Empty,
  Popconfirm,
  Tag,
  Progress,
  Skeleton
} from 'antd';
import {
  ArrowLeftOutlined,
  UploadOutlined,
  ZoomInOutlined,
  StarOutlined,
  StarFilled,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import ReactViewer from 'react-viewer';
import 'react-viewer/dist/index.css';
import { imageService, specimenService } from '../../services/specimen.service';
import { SpecimenImage, ImageType } from '../../types';
import { useAuthStore, isCurator } from '../../store/authStore';

const { Title } = Typography;
const { Option } = Select;

const ImageViewer: React.FC = () => {
  const { specimenId } = useParams<{ specimenId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [images, setImages] = useState<SpecimenImage[]>([]);
  const [specimenName, setSpecimenName] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageLoadingStates, setImageLoadingStates] = useState<Record<number, 'loading' | 'success' | 'error'>>({});
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [currentImage, setCurrentImage] = useState<SpecimenImage | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadType, setUploadType] = useState(ImageType.DETAIL);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [editForm] = Form.useForm();

  useEffect(() => {
    if (specimenId) {
      loadImages();
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

  const loadImages = async () => {
    setLoading(true);
    try {
      const result = await imageService.getImagesBySpecimenId(Number(specimenId));
      setImages(result.images);
      const loadingStates: Record<number, 'loading' | 'success' | 'error'> = {};
      result.images.forEach((img: SpecimenImage) => {
        loadingStates[img.id] = 'loading';
      });
      setImageLoadingStates(loadingStates);
    } catch (error) {
      message.error('加载图片失败');
    } finally {
      setLoading(false);
    }
  };

  const handleImageLoad = useCallback((imageId: number) => {
    setImageLoadingStates((prev) => ({
      ...prev,
      [imageId]: 'success'
    }));
  }, []);

  const handleImageError = useCallback((imageId: number) => {
    setImageLoadingStates((prev) => ({
      ...prev,
      [imageId]: 'error'
    }));
    message.error('图片加载失败，请检查网络连接');
  }, []);

  const handleUpload = async () => {
    if (uploadFiles.length === 0) {
      message.warning('请选择要上传的图片');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    try {
      await imageService.uploadImages(
        Number(specimenId),
        uploadFiles,
        uploadType,
        (progress) => setUploadProgress(progress)
      );
      message.success('上传成功');
      setUploadModalVisible(false);
      setUploadFiles([]);
      setUploadProgress(0);
      loadImages();
    } catch (error) {
      message.error('上传失败，请检查网络或文件大小');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSetPrimary = async (imageId: number) => {
    try {
      await imageService.setPrimaryImage(imageId);
      message.success('设置成功');
      loadImages();
    } catch (error) {
      message.error('设置失败');
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    try {
      await imageService.deleteImage(imageId);
      message.success('删除成功');
      loadImages();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleEditImage = (image: SpecimenImage) => {
    setCurrentImage(image);
    editForm.setFieldsValue({
      description: image.description,
      imageType: image.imageType,
      sortOrder: image.sortOrder
    });
    setEditModalVisible(true);
  };

  const handleSaveEdit = async (values: any) => {
    if (!currentImage) return;

    try {
      await imageService.updateImage(currentImage.id, values);
      message.success('更新成功');
      setEditModalVisible(false);
      loadImages();
    } catch (error) {
      message.error('更新失败');
    }
  };

  const getImageTypeLabel = (type: ImageType) => {
    const labels: Record<ImageType, string> = {
      [ImageType.MAIN]: '主图',
      [ImageType.DETAIL]: '细节',
      [ImageType.MICROSCOPE]: '显微',
      [ImageType.HABITAT]: '生境',
      [ImageType.OTHER]: '其他'
    };
    return labels[type] || type;
  };

  const viewerImages = images
    .filter((img) => imageLoadingStates[img.id] !== 'error')
    .map((img) => ({
      src: img.fileUrl,
      alt: img.originalName,
      downloadUrl: img.fileUrl
    }));

  const openViewer = (index: number) => {
    const validImages = images.filter((img) => imageLoadingStates[img.id] !== 'error');
    const validIndex = validImages.findIndex((_, i) => i === index);
    if (validIndex >= 0) {
      setViewerIndex(validIndex);
      setViewerVisible(true);
    } else {
      message.warning('当前图片无法预览');
    }
  };

  const getImagePlaceholder = () => (
    <div
      style={{
        width: '100%',
        height: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        color: '#999'
      }}
    >
      <Skeleton.Image active style={{ width: '100%', height: '100%' }} />
    </div>
  );

  const getErrorPlaceholder = () => (
    <div
      style={{
        width: '100%',
        height: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff1f0',
        color: '#ff4d4f'
      }}
    >
      <ExclamationCircleOutlined style={{ fontSize: 32, marginBottom: 8 }} />
      <span style={{ fontSize: 12 }}>加载失败</span>
    </div>
  );

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/specimens/${specimenId}`)}>
          返回标本详情
        </Button>
        {isCurator(user?.role) && (
          <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadModalVisible(true)}>
            上传图片
          </Button>
        )}
      </Space>

      <Card loading={loading}>
        <Title level={4} style={{ marginBottom: 16 }}>
          {specimenName} - 影像资料
        </Title>

        {images.length === 0 ? (
          <Empty description="暂无影像资料" />
        ) : (
          <div className="image-gallery">
            {images.map((image, index) => (
              <div key={image.id} className="image-item">
                {imageLoadingStates[image.id] === 'loading' && getImagePlaceholder()}
                {imageLoadingStates[image.id] === 'error' && getErrorPlaceholder()}
                <img
                  src={image.fileUrl}
                  alt={image.originalName}
                  onClick={() => imageLoadingStates[image.id] === 'success' && openViewer(index)}
                  onLoad={() => handleImageLoad(image.id)}
                  onError={() => handleImageError(image.id)}
                  style={{
                    display: imageLoadingStates[image.id] === 'success' ? 'block' : 'none',
                    cursor: imageLoadingStates[image.id] === 'success' ? 'zoom-in' : 'default',
                    objectFit: 'contain',
                    backgroundColor: '#fafafa'
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    display: 'flex',
                    gap: 4,
                    opacity: imageLoadingStates[image.id] === 'success' ? 1 : 0
                  }}
                >
                  {image.isPrimary && (
                    <Tag color="gold" icon={<StarFilled />}>
                      主图
                    </Tag>
                  )}
                  <Tag color="blue">{getImageTypeLabel(image.imageType)}</Tag>
                </div>
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    color: '#fff',
                    padding: '8px',
                    fontSize: 12,
                    opacity: 0,
                    transition: 'opacity 0.3s',
                    pointerEvents: imageLoadingStates[image.id] === 'success' ? 'auto' : 'none'
                  }}
                  className="image-item-actions"
                >
                  <Space>
                    <Button
                      type="text"
                      size="small"
                      icon={<ZoomInOutlined />}
                      onClick={() => openViewer(index)}
                      style={{ color: '#fff' }}
                    >
                      查看
                    </Button>
                    {isCurator(user?.role) && (
                      <>
                        {!image.isPrimary && (
                          <Button
                            type="text"
                            size="small"
                            icon={<StarOutlined />}
                            onClick={() => handleSetPrimary(image.id)}
                            style={{ color: '#fff' }}
                          >
                            设为主图
                          </Button>
                        )}
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => handleEditImage(image)}
                          style={{ color: '#fff' }}
                        >
                          编辑
                        </Button>
                        <Popconfirm
                          title="确定要删除这张图片吗？"
                          onConfirm={() => handleDeleteImage(image.id)}
                          okText="确定"
                          cancelText="取消"
                        >
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            style={{ color: '#ff4d4f' }}
                          >
                            删除
                          </Button>
                        </Popconfirm>
                      </>
                    )}
                  </Space>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {viewerImages.length > 0 && (
        <ReactViewer
          visible={viewerVisible}
          onClose={() => setViewerVisible(false)}
          images={viewerImages}
          activeIndex={viewerIndex}
          drag={true}
          zoom={true}
          rotate={true}
          noClose={false}
          downloadable={true}
          attribute={true}
          zoomSpeed={0.1}
          rotatable={true}
          scalable={true}
        />
      )}

      <Modal
        title="上传图片"
        open={uploadModalVisible}
        onOk={handleUpload}
        onCancel={() => {
          setUploadModalVisible(false);
          setUploadFiles([]);
          setUploadProgress(0);
        }}
        okText="上传"
        cancelText="取消"
        confirmLoading={isUploading}
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Form.Item label="图片类型" style={{ marginBottom: 0 }}>
            <Select
              value={uploadType}
              onChange={setUploadType}
              style={{ width: '100%' }}
              disabled={isUploading}
            >
              <Option value={ImageType.MAIN}>主图</Option>
              <Option value={ImageType.DETAIL}>细节图</Option>
              <Option value={ImageType.MICROSCOPE}>显微图</Option>
              <Option value={ImageType.HABITAT}>生境图</Option>
              <Option value={ImageType.OTHER}>其他</Option>
            </Select>
          </Form.Item>
          <Upload.Dragger
            multiple
            beforeUpload={(file) => {
              setUploadFiles((prev) => [...prev, file]);
              return false;
            }}
            onRemove={(file) => {
              setUploadFiles((prev) => prev.filter((f) => f.name !== file.name));
            }}
            fileList={uploadFiles.map((f) => ({ name: f.name, uid: f.name }))}
            accept="image/*"
            disabled={isUploading}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽图片到此处上传</p>
            <p className="ant-upload-hint">支持批量上传，单张最大500MB</p>
          </Upload.Dragger>
          {isUploading && (
            <Progress
              percent={uploadProgress}
              status="active"
              format={(percent) => `上传中 ${percent}%`}
            />
          )}
        </Space>
      </Modal>

      <Modal
        title="编辑图片信息"
        open={editModalVisible}
        onOk={editForm.submit}
        onCancel={() => setEditModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical" onFinish={handleSaveEdit}>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="请输入图片描述" />
          </Form.Item>
          <Form.Item name="imageType" label="图片类型">
            <Select>
              <Option value={ImageType.MAIN}>主图</Option>
              <Option value={ImageType.DETAIL}>细节图</Option>
              <Option value={ImageType.MICROSCOPE}>显微图</Option>
              <Option value={ImageType.HABITAT}>生境图</Option>
              <Option value={ImageType.OTHER}>其他</Option>
            </Select>
          </Form.Item>
          <Form.Item name="sortOrder" label="排序">
            <Input.Number min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <style>{`
        .image-item:hover .image-item-actions {
          opacity: 1 !important;
        }
        .image-item {
          position: relative;
          overflow: hidden;
          border-radius: 8px;
          background: #fafafa;
        }
        .image-item img {
          transition: transform 0.3s ease;
        }
        .image-item:hover img {
          transform: scale(1.05);
        }
      `}</style>
    </div>
  );
};

export default ImageViewer;
