import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Skeleton,
  Tabs,
  InputNumber,
  Alert,
  Tooltip,
  Divider
} from 'antd';
import {
  ArrowLeftOutlined,
  UploadOutlined,
  ZoomInOutlined,
  StarOutlined,
  StarFilled,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  CloudUploadOutlined,
  TagOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  PauseCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import ReactViewer from 'react-viewer';
import 'react-viewer/dist/index.css';
import { imageService, specimenService, chunkUploadService } from '../../services/specimen.service';
import { SpecimenImage, ImageType } from '../../types';
import { useAuthStore, isCurator } from '../../store/authStore';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

interface UploadTask {
  id: string;
  file: File;
  fileId?: string;
  totalChunks: number;
  chunkSize: number;
  uploadedChunks: Set<number>;
  progress: number;
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error';
  error?: string;
  specimenId: number;
  imageType: string;
  description?: string;
  tags?: string;
}

const ImageViewerV2: React.FC = () => {
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
  const [activeTab, setActiveTab] = useState<'gallery' | 'grid'>('gallery');
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [batchTagModal, setBatchTagModal] = useState(false);
  const [selectedImageIds, setSelectedImageIds] = useState<number[]>([]);
  const [editForm] = Form.useForm();
  const [batchTagForm] = Form.useForm();
  const uploadControllerRef = useRef<AbortController | null>(null);

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
      const sortedImages = [...result.images].sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return a.sortOrder - b.sortOrder;
      });
      setImages(sortedImages);
      const loadingStates: Record<number, 'loading' | 'success' | 'error'> = {};
      sortedImages.forEach((img: SpecimenImage) => {
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
  }, []);

  const handleFilesSelect = async (files: File[], imageType: string) => {
    const largeFileThreshold = 50 * 1024 * 1024;
    const newTasks: UploadTask[] = [];

    for (const file of files) {
      const shouldUseChunk = file.size > largeFileThreshold;

      if (shouldUseChunk) {
        try {
          const initResult = await chunkUploadService.initUpload(
            file.name,
            file.size,
            file.type
          );

          if (initResult.uploaded && initResult.image) {
            message.info(`文件 ${file.name} 已存在，已跳过`);
            continue;
          }

          newTasks.push({
            id: `${Date.now()}-${Math.random()}`,
            file,
            fileId: initResult.fileId,
            totalChunks: initResult.totalChunks,
            chunkSize: initResult.chunkSize,
            uploadedChunks: new Set(),
            progress: 0,
            status: 'pending',
            specimenId: Number(specimenId),
            imageType
          });
        } catch (error) {
          message.error(`初始化文件 ${file.name} 失败`);
        }
      } else {
        try {
          const result = await imageService.uploadImages(
            Number(specimenId),
            [file],
            imageType,
            (progress) => {
              setUploadTasks((prev) =>
                prev.map((t) =>
                  t.id === task.id
                    ? { ...t, progress, status: 'uploading' as const }
                    : t
                )
              );
            }
          );
          message.success(`文件 ${file.name} 上传成功`);
          loadImages();
        } catch (error) {
          message.error(`文件 ${file.name} 上传失败`);
        }
      }
    }

    if (newTasks.length > 0) {
      setUploadTasks((prev) => [...prev, ...newTasks]);
      processChunkUploads(newTasks);
    }
  };

  const processChunkUploads = async (tasks: UploadTask[]) => {
    for (const task of tasks) {
      if (task.status === 'completed' || task.status === 'error') continue;

      try {
        setUploadTasks((prev) =>
          prev.map((t) =>
            t.id === task.id ? { ...t, status: 'uploading' as const } : t
          )
        );

        const concurrency = 3;
        const chunksToUpload = [];

        for (let i = 0; i < task.totalChunks; i++) {
          if (!task.uploadedChunks.has(i)) {
            chunksToUpload.push(i);
          }
        }

        for (let i = 0; i < chunksToUpload.length; i += concurrency) {
          const batch = chunksToUpload.slice(i, i + concurrency);
          
          await Promise.all(
            batch.map(async (chunkIndex) => {
              const start = chunkIndex * task.chunkSize;
              const end = Math.min(start + task.chunkSize, task.file.size);
              const chunk = task.file.slice(start, end);

              try {
                await chunkUploadService.uploadChunk(
                  task.fileId!,
                  chunkIndex,
                  chunk,
                  (progress) => {
                    const overallProgress = Math.round(
                      ((task.uploadedChunks.size + (progress / 100)) / task.totalChunks) * 100
                    );
                    setUploadTasks((prev) =>
                      prev.map((t) =>
                        t.id === task.id
                          ? { ...t, progress: Math.min(overallProgress, 99) }
                          : t
                      )
                    );
                  }
                );

                setUploadTasks((prev) =>
                  prev.map((t) => {
                    if (t.id === task.id) {
                      const newUploaded = new Set(t.uploadedChunks);
                      newUploaded.add(chunkIndex);
                      return { ...t, uploadedChunks: newUploaded };
                    }
                    return t;
                  })
                );
              } catch (error) {
                console.error(`分片 ${chunkIndex} 上传失败:`, error);
                throw error;
              }
            })
          );
        }

        const currentTask = uploadTasks.find((t) => t.id === task.id);
        if (currentTask && currentTask.uploadedChunks.size === currentTask.totalChunks) {
          await chunkUploadService.completeUpload({
            fileId: task.fileId!,
            specimenId: task.specimenId,
            imageType: task.imageType,
            description: task.description,
            tags: task.tags
          });

          setUploadTasks((prev) =>
            prev.map((t) =>
              t.id === task.id
                ? { ...t, status: 'completed' as const, progress: 100 }
                : t
            )
          );

          message.success(`文件 ${task.file.name} 上传成功`);
          loadImages();

          setTimeout(() => {
            setUploadTasks((prev) => prev.filter((t) => t.id !== task.id));
          }, 2000);
        }
      } catch (error) {
        setUploadTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? { ...t, status: 'error' as const, error: '上传失败，可重试' }
              : t
          )
        );
        message.error(`文件 ${task.file.name} 上传失败`);
      }
    }
  };

  const handleRetryUpload = async (taskId: string) => {
    const task = uploadTasks.find((t) => t.id === taskId);
    if (!task) return;

    setUploadTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: 'uploading' as const, error: undefined }
          : t
      )
    );

    processChunkUploads([task]);
  };

  const handleCancelUpload = async (taskId: string) => {
    const task = uploadTasks.find((t) => t.id === taskId);
    if (!task) return;

    if (task.fileId) {
      try {
        await chunkUploadService.abortUpload(task.fileId);
      } catch (error) {
        console.error('取消上传失败:', error);
      }
    }

    setUploadTasks((prev) => prev.filter((t) => t.id !== taskId));
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
      sortOrder: image.sortOrder,
      tags: image.tags
    });
    setEditModalVisible(true);
  };

  const handleSaveEdit = async (values: any) => {
    if (!currentImage) return;

    try {
      await imageService.updateImage(currentImage.id, values);
      if (values.tags !== undefined) {
        await chunkUploadService.updateImageTags(currentImage.id, values.tags, values.description);
      }
      message.success('更新成功');
      setEditModalVisible(false);
      loadImages();
    } catch (error) {
      message.error('更新失败');
    }
  };

  const handleImageSelect = (imageId: number) => {
    setSelectedImageIds((prev) =>
      prev.includes(imageId)
        ? prev.filter((id) => id !== imageId)
        : [...prev, imageId]
    );
  };

  const handleBatchTag = async () => {
    try {
      const values = await batchTagForm.validateFields();
      const tags = values.tags || '';
      
      for (const imageId of selectedImageIds) {
        await chunkUploadService.updateImageTags(imageId, tags);
      }
      
      message.success(`成功为 ${selectedImageIds.length} 张图片更新标签`);
      setBatchTagModal(false);
      setSelectedImageIds([]);
      loadImages();
    } catch (error) {
      message.error('批量标签更新失败');
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

  const validImages = useMemo(() =>
    images.filter((img) => imageLoadingStates[img.id] !== 'error'),
  [images, imageLoadingStates]);

  const viewerImages = useMemo(() =>
    validImages.map((img) => ({
      src: img.fileUrl,
      alt: img.originalName,
      downloadUrl: img.fileUrl
    })),
  [validImages]);

  const openViewer = (index: number) => {
    const image = validImages[index];
    if (image) {
      const actualIndex = images.findIndex((img) => img.id === image.id);
      if (actualIndex >= 0) {
        setViewerIndex(actualIndex);
        setViewerVisible(true);
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const renderImageItem = (image: SpecimenImage, index: number) => (
    <div key={image.id} className="image-item">
      {imageLoadingStates[image.id] === 'loading' && (
        <div className="image-placeholder">
          <Skeleton.Image active />
        </div>
      )}
      {imageLoadingStates[image.id] === 'error' && (
        <div className="image-placeholder error">
          <ExclamationCircleOutlined style={{ fontSize: 32, color: '#ff4d4f' }} />
          <span style={{ marginTop: 8, fontSize: 12 }}>加载失败</span>
        </div>
      )}
      <img
        src={image.fileUrl}
        alt={image.originalName}
        loading="lazy"
        onClick={() => imageLoadingStates[image.id] === 'success' && openViewer(index)}
        onLoad={() => handleImageLoad(image.id)}
        onError={() => handleImageError(image.id)}
        style={{
          display: imageLoadingStates[image.id] === 'success' ? 'block' : 'none'
        }}
      />
      <div className="image-header">
        <Space size={4}>
          {image.isPrimary && (
            <Tag color="gold" icon={<StarFilled />} style={{ margin: 0 }}>
              主图
            </Tag>
          )}
          <Tag color="blue" style={{ margin: 0 }}>{getImageTypeLabel(image.imageType)}</Tag>
        </Space>
        {isCurator(user?.role) && (
          <input
            type="checkbox"
            className="image-select"
            checked={selectedImageIds.includes(image.id)}
            onChange={() => handleImageSelect(image.id)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
      <div className="image-footer">
        <div className="image-info">
          <div className="image-name" title={image.originalName}>
            {image.originalName}
          </div>
          {image.tags && (
            <div className="image-tags">
              {image.tags.split(',').slice(0, 2).map((tag, i) => (
                <Tag key={i} size="small" color="default">
                  {tag.trim()}
                </Tag>
              ))}
            </div>
          )}
        </div>
        <div className="image-actions">
          <Tooltip title="查看大图">
            <Button
              type="text"
              size="small"
              icon={<ZoomInOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                openViewer(index);
              }}
            />
          </Tooltip>
          {isCurator(user?.role) && (
            <>
              {!image.isPrimary && (
                <Tooltip title="设为主图">
                  <Button
                    type="text"
                    size="small"
                    icon={<StarOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetPrimary(image.id);
                    }}
                  />
                </Tooltip>
              )}
              <Tooltip title="编辑">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditImage(image);
                  }}
                />
              </Tooltip>
              <Popconfirm
                title="确定要删除这张图片吗？"
                onConfirm={(e) => {
                  e?.stopPropagation();
                  handleDeleteImage(image.id);
                }}
                okText="确定"
                cancelText="取消"
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => e.stopPropagation()}
                />
              </Popconfirm>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const tabItems = [
    { key: 'gallery', label: '画廊视图' },
    { key: 'grid', label: '网格视图' }
  ];

  return (
    <div className="image-viewer-v2">
      <Card className="page-header">
        <div className="header-content">
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/specimens/${specimenId}`)}>
              返回标本详情
            </Button>
            <Title level={4} style={{ margin: 0 }}>
              {specimenName} - 影像资料
            </Title>
            <Tag color="blue">{images.length} 张图片</Tag>
          </Space>
          <Space>
            {isCurator(user?.role) && selectedImageIds.length > 0 && (
              <Button onClick={() => setBatchTagModal(true)}>
                <TagOutlined /> 批量标签 ({selectedImageIds.length})
              </Button>
            )}
            {isCurator(user?.role) && (
              <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadModalVisible(true)}>
                上传图片
              </Button>
            )}
          </Space>
        </div>
      </Card>

      {uploadTasks.length > 0 && (
        <Card className="upload-tasks" size="small">
          <div className="tasks-header">
            <Space>
              <CloudUploadOutlined />
              <span>正在上传 ({uploadTasks.length})</span>
            </Space>
            <Button
              type="text"
              size="small"
              onClick={() => uploadTasks.forEach((t) => handleCancelUpload(t.id))}
            >
              取消全部
            </Button>
          </div>
          <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size={8}>
            {uploadTasks.map((task) => (
              <div key={task.id} className="upload-task-item">
                <div className="task-info">
                  <span className="task-name">{task.file.name}</span>
                  <span className="task-size">{formatFileSize(task.file.size)}</span>
                </div>
                <div className="task-progress">
                  <Progress
                    percent={task.progress}
                    size="small"
                    status={
                      task.status === 'error'
                        ? 'exception'
                        : task.status === 'completed'
                        ? 'success'
                        : 'active'
                    }
                  />
                </div>
                <div className="task-actions">
                  {task.status === 'error' && (
                    <Button
                      type="text"
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={() => handleRetryUpload(task.id)}
                    >
                      重试
                    </Button>
                  )}
                  {task.status === 'uploading' && (
                    <Button
                      type="text"
                      size="small"
                      icon={<PauseCircleOutlined />}
                      onClick={() => handleCancelUpload(task.id)}
                    >
                      取消
                    </Button>
                  )}
                  {task.status === 'completed' && (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  )}
                </div>
              </div>
            ))}
          </Space>
        </Card>
      )}

      <Card
        loading={loading}
        className="images-container"
        tabBarExtraContent={
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
            size="small"
          />
        }
      >
        {images.length === 0 ? (
          <Empty
            description={
              <div>
                <p>暂无影像资料</p>
                {isCurator(user?.role) && (
                  <Button type="primary" onClick={() => setUploadModalVisible(true)}>
                    <UploadOutlined /> 上传第一张图片
                  </Button>
                )}
              </div>
            }
            style={{ padding: 100 }}
          />
        ) : (
          <div className={`image-grid ${activeTab === 'gallery' ? 'gallery-view' : 'grid-view'}`}>
            {images.map((image, index) => renderImageItem(image, index))}
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
          downloadable={true}
          zoomSpeed={0.1}
          noToolbar={false}
        />
      )}

      <Modal
        title="上传图片"
        open={uploadModalVisible}
        onCancel={() => {
          setUploadModalVisible(false);
        }}
        footer={null}
        width={700}
        destroyOnClose
      >
        <Upload.Dragger
          multiple
          beforeUpload={(file) => {
            const form = document.getElementById('upload-form') as HTMLFormElement;
            const formData = new FormData(form);
            const imageType = formData.get('imageType') as string || 'detail';
            handleFilesSelect([file], imageType);
            return false;
          }}
          onRemove={(file) => {}}
          accept="image/*"
          showUploadList={false}
          style={{ marginBottom: 16 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽图片到此处上传</p>
          <p className="ant-upload-hint">
            支持批量上传，大于50MB的文件将自动使用分片上传，单张最大500MB
          </p>
        </Upload.Dragger>

        <Form id="upload-form" layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label="图片类型" name="imageType" initialValue="detail">
                <Select>
                  <Option value="main">主图</Option>
                  <Option value="detail">细节图</Option>
                  <Option value="microscope">显微图</Option>
                  <Option value="habitat">生境图</Option>
                  <Option value="other">其他</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="标签（逗号分隔）" name="tags">
                <Input placeholder="例如：珊瑚, 热带, 深海" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="描述" name="description">
            <TextArea rows={2} placeholder="请输入图片描述（可选）" />
          </Form.Item>
        </Form>

        <Alert
          message="提示"
          description="大文件上传过程中请勿关闭页面，支持断点续传。"
          type="info"
          showIcon
        />
      </Modal>

      <Modal
        title="编辑图片信息"
        open={editModalVisible}
        onOk={editForm.submit}
        onCancel={() => setEditModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form form={editForm} layout="vertical" onFinish={handleSaveEdit}>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="请输入图片描述" />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="imageType" label="图片类型">
                <Select>
                  <Option value="main">主图</Option>
                  <Option value="detail">细节图</Option>
                  <Option value="microscope">显微图</Option>
                  <Option value="habitat">生境图</Option>
                  <Option value="other">其他</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="sortOrder" label="排序">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="tags" label="标签（逗号分隔）">
            <Input placeholder="例如：珊瑚, 热带, 深海" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`批量设置标签 (${selectedImageIds.length} 张图片)`}
        open={batchTagModal}
        onOk={handleBatchTag}
        onCancel={() => setBatchTagModal(false)}
        okText="确认"
        cancelText="取消"
      >
        <Form form={batchTagForm} layout="vertical">
          <Form.Item
            name="tags"
            label="标签"
            rules={[{ required: true, message: '请输入标签' }]}
          >
            <Input placeholder="多个标签用逗号分隔，例如：珊瑚, 热带, 深海" />
          </Form.Item>
          <Alert
            message="注意"
            description="此操作将覆盖所选图片的原有标签。"
            type="warning"
            showIcon
          />
        </Form>
      </Modal>

      <style>{`
        .image-viewer-v2 .page-header {
          margin-bottom: 16px;
        }
        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }
        .upload-tasks {
          margin-bottom: 16px;
        }
        .tasks-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .upload-task-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px;
          background: #fafafa;
          border-radius: 4px;
        }
        .task-info {
          flex: 1;
          min-width: 0;
        }
        .task-name {
          display: block;
          font-size: 13px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .task-size {
          font-size: 12px;
          color: #999;
        }
        .task-progress {
          width: 200px;
        }
        .images-container {
          min-height: 400px;
        }
        .image-grid {
          display: grid;
          gap: 16px;
        }
        .image-grid.gallery-view {
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        }
        .image-grid.grid-view {
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        }
        .image-item {
          position: relative;
          border-radius: 8px;
          overflow: hidden;
          background: #f5f5f5;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .image-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .image-item img {
          width: 100%;
          aspect-ratio: 4/3;
          object-fit: cover;
        }
        .image-placeholder {
          width: 100%;
          aspect-ratio: 4/3;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #fafafa;
        }
        .image-placeholder.error {
          background: #fff1f0;
          color: #ff4d4f;
        }
        .image-header {
          position: absolute;
          top: 8px;
          left: 8px;
          right: 8px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          z-index: 2;
        }
        .image-select {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }
        .image-footer {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.85), transparent);
          padding: 16px 12px 12px;
          color: white;
          transform: translateY(60%);
          transition: transform 0.2s;
        }
        .image-item:hover .image-footer {
          transform: translateY(0);
        }
        .image-name {
          font-size: 13px;
          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .image-tags {
          margin-bottom: 8px;
        }
        .image-actions {
          display: flex;
          gap: 4px;
        }
        .image-actions .ant-btn {
          color: white !important;
          background: rgba(255, 255, 255, 0.1);
        }
        .image-actions .ant-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
};

export default ImageViewerV2;
