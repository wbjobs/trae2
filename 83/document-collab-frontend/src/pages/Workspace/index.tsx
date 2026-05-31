import React, { useEffect, useState } from 'react'
import {
  Row,
  Col,
  Card,
  Button,
  Input,
  Modal,
  Form,
  Tag,
  Empty,
  Spin,
  message,
  Popconfirm,
  Space,
  Select,
} from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  HistoryOutlined,
  DeleteOutlined,
  FileTextOutlined,
  BranchesOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { documentApi, DocumentDTO } from '../../api/document'
import { branchApi } from '../../api/branch'
import BranchManager from '../../components/BranchManager'
import ChunkUpload from '../../components/ChunkUpload'
import dayjs from 'dayjs'

const Workspace: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [branchManagerOpen, setBranchManagerOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState('')
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadDocumentId, setUploadDocumentId] = useState('')
  const [branchCounts, setBranchCounts] = useState<Record<string, number>>({})
  const [form] = Form.useForm()
  const [uploadForm] = Form.useForm()
  const navigate = useNavigate()

  const fetchDocuments = async () => {
    setLoading(true)
    try {
      const data = await documentApi.getList()
      setDocuments(data || [])
      const counts: Record<string, number> = {}
      for (const doc of data || []) {
        try {
          const branches = await branchApi.getList(doc.id)
          counts[doc.id] = branches.length
        } catch {
          counts[doc.id] = 0
        }
      }
      setBranchCounts(counts)
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const openBranchManager = (documentId: string) => {
    setSelectedDocumentId(documentId)
    setBranchManagerOpen(true)
  }

  const handleChunkUploadSuccess = () => {
    fetchDocuments()
    setUploadModalOpen(false)
  }

  useEffect(() => {
    fetchDocuments()
  }, [])

  const filteredDocuments = documents.filter(
    (doc) =>
      doc.name.toLowerCase().includes(searchText.toLowerCase()) ||
      (doc.description && doc.description.toLowerCase().includes(searchText.toLowerCase()))
  )

  const handleCreate = async (values: { name: string; description?: string }) => {
    setCreateLoading(true)
    try {
      await documentApi.create(values)
      message.success('文档创建成功')
      setCreateModalOpen(false)
      form.resetFields()
      fetchDocuments()
    } catch {
    } finally {
      setCreateLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await documentApi.delete(id)
      message.success('文档删除成功')
      fetchDocuments()
    } catch {
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <Input
          placeholder="搜索文档..."
          prefix={<SearchOutlined style={{ color: '#b0b8c4' }} />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 360, height: 40, borderRadius: 8 }}
          allowClear
        />
        <Space>
          <Button
            icon={<UploadOutlined />}
            onClick={() => {
              if (documents.length === 0) {
                message.warning('请先创建文档')
                return
              }
              setUploadDocumentId('')
              setUploadModalOpen(true)
            }}
            style={{
              height: 40,
              borderRadius: 8,
            }}
          >
            上传大文件
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalOpen(true)}
            style={{
              height: 40,
              borderRadius: 8,
              background: '#1e3a5f',
              paddingLeft: 20,
              paddingRight: 20,
            }}
          >
            新建文档
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        {filteredDocuments.length === 0 && !loading ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span style={{ color: '#999' }}>
                {searchText ? '未找到匹配的文档' : '暂无文档，点击新建文档开始'}
              </span>
            }
            style={{ marginTop: 120 }}
          >
            {!searchText && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalOpen(true)}
                style={{ background: '#1e3a5f' }}
              >
                新建文档
              </Button>
            )}
          </Empty>
        ) : (
          <Row gutter={[20, 20]}>
            {filteredDocuments.map((doc) => (
              <Col key={doc.id} xs={24} sm={12} lg={8}>
                <Card
                  hoverable
                  style={{
                    borderRadius: 12,
                    border: '1px solid #e8ecf1',
                    height: '100%',
                  }}
                  styles={{ body: { padding: 20, display: 'flex', flexDirection: 'column', height: '100%' } }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileTextOutlined style={{ fontSize: 18, color: '#1e3a5f' }} />
                        <span
                          style={{
                            fontSize: 16,
                            fontWeight: 600,
                            color: '#1e3a5f',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 180,
                          }}
                        >
                          {doc.name}
                        </span>
                      </div>
                      <Space size={4}>
                        {doc.currentVersionNumber != null && (
                          <Tag
                            color="blue"
                            style={{ borderRadius: 4, margin: 0 }}
                          >
                            v{doc.currentVersionNumber}
                          </Tag>
                        )}
                        <Tag
                          color="purple"
                          style={{ borderRadius: 4, margin: 0 }}
                          icon={<BranchesOutlined />}
                        >
                          {branchCounts[doc.id] ?? 0}
                        </Tag>
                      </Space>
                    </div>
                    <p
                      style={{
                        color: '#888',
                        fontSize: 13,
                        lineHeight: 1.6,
                        marginBottom: 16,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        minHeight: 42,
                      }}
                    >
                      {doc.description || '暂无描述'}
                    </p>
                    <div style={{ color: '#b0b8c4', fontSize: 12 }}>
                      更新于 {dayjs(doc.updatedAt).format('YYYY-MM-DD HH:mm')}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginTop: 16,
                      borderTop: '1px solid #f0f0f0',
                      paddingTop: 16,
                    }}
                  >
                    <Button
                      type="primary"
                      icon={<EditOutlined />}
                      onClick={() => navigate(`/documents/${doc.id}/edit`)}
                      style={{
                        flex: 1,
                        background: '#1e3a5f',
                        borderRadius: 6,
                        height: 34,
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      icon={<BranchesOutlined />}
                      onClick={() => openBranchManager(doc.id)}
                      style={{ flex: 1, borderRadius: 6, height: 34 }}
                    >
                      分支
                    </Button>
                    <Button
                      icon={<HistoryOutlined />}
                      onClick={() => navigate(`/documents/${doc.id}/versions`)}
                      style={{ flex: 1, borderRadius: 6, height: 34 }}
                    >
                      版本
                    </Button>
                    <Popconfirm
                      title="确定要删除此文档吗？"
                      description="删除后无法恢复"
                      onConfirm={() => handleDelete(doc.id)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        style={{ borderRadius: 6, height: 34 }}
                      />
                    </Popconfirm>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Spin>

      <Modal
        title="新建文档"
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false)
          form.resetFields()
        }}
        footer={null}
        centered
        width={480}
      >
        <Form form={form} onFinish={handleCreate} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="文档名称"
            rules={[{ required: true, message: '请输入文档名称' }]}
          >
            <Input placeholder="请输入文档名称" style={{ borderRadius: 6 }} />
          </Form.Item>
          <Form.Item name="description" label="文档描述">
            <Input.TextArea
              placeholder="请输入文档描述（可选）"
              rows={3}
              style={{ borderRadius: 6 }}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Button
              onClick={() => {
                setCreateModalOpen(false)
                form.resetFields()
              }}
              style={{ marginRight: 8, borderRadius: 6 }}
            >
              取消
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={createLoading}
              style={{ background: '#1e3a5f', borderRadius: 6 }}
            >
              创建
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <BranchManager
        open={branchManagerOpen}
        documentId={selectedDocumentId}
        onClose={() => setBranchManagerOpen(false)}
        onSwitch={() => fetchDocuments()}
        onMerge={() => fetchDocuments()}
      />

      <Modal
        title="上传大文件"
        open={uploadModalOpen}
        onCancel={() => {
          setUploadModalOpen(false)
          uploadForm.resetFields()
        }}
        footer={null}
        centered
        width={600}
      >
        {!uploadDocumentId ? (
          <Form form={uploadForm} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item
              name="documentId"
              label="选择文档"
              rules={[{ required: true, message: '请选择文档' }]}
            >
              <Select
                placeholder="选择要上传的文档"
                style={{ borderRadius: 6 }}
                options={documents.map((d) => ({
                  label: d.name,
                  value: d.id,
                }))}
                onChange={(value) => setUploadDocumentId(value)}
              />
            </Form.Item>
          </Form>
        ) : (
          <ChunkUpload
            documentId={uploadDocumentId}
            onSuccess={handleChunkUploadSuccess}
            onCancel={() => {
              setUploadModalOpen(false)
              setUploadDocumentId('')
              uploadForm.resetFields()
            }}
          />
        )}
      </Modal>
    </div>
  )
}

export default Workspace
