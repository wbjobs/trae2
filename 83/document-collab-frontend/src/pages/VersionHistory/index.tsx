import React, { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Tag,
  Modal,
  Empty,
  Spin,
  Descriptions,
  Timeline,
  message,
  Popconfirm,
} from 'antd'
import {
  ArrowLeftOutlined,
  RollbackOutlined,
  DownloadOutlined,
  EyeOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { documentApi, DocumentDTO } from '../../api/document'
import { versionApi, DocumentVersionDTO } from '../../api/version'
import dayjs from 'dayjs'

const VersionHistory: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [document, setDocument] = useState<DocumentDTO | null>(null)
  const [versions, setVersions] = useState<DocumentVersionDTO[]>([])
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersionDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [contentPreview, setContentPreview] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    if (id) {
      loadData()
    }
  }, [id])

  const loadData = async () => {
    if (!id) return
    setLoading(true)
    try {
      const [doc, versionList] = await Promise.all([
        documentApi.getById(id),
        versionApi.getVersions(id),
      ])
      setDocument(doc)
      const sortedVersions = (versionList || []).sort(
        (a, b) => b.versionNumber - a.versionNumber
      )
      setVersions(sortedVersions)
      if (sortedVersions.length > 0) {
        setSelectedVersion(sortedVersions[0])
      }
    } catch {
      message.error('加载版本历史失败')
    } finally {
      setLoading(false)
    }
  }

  const handlePreview = async (version: DocumentVersionDTO) => {
    if (!id) return
    setPreviewLoading(true)
    setPreviewOpen(true)
    try {
      const content = await versionApi.getContent(id, version.versionNumber)
      setContentPreview(content || '<p style="color:#999">暂无内容</p>')
    } catch {
      setContentPreview('<p style="color:#f00">加载内容失败</p>')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleRestore = async (version: DocumentVersionDTO) => {
    if (!id) return
    setRestoring(true)
    try {
      await versionApi.restore(id, version.versionNumber)
      message.success(`版本 v${version.versionNumber} 已恢复`)
      loadData()
    } catch {
    } finally {
      setRestoring(false)
    }
  }

  const handleDownload = (version: DocumentVersionDTO) => {
    if (!id) return
    const url = versionApi.getDownloadUrl(id, version.versionNumber)
    window.open(url, '_blank')
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    )
  }

  return (
    <div>
      <div
        style={{
          background: '#fff',
          padding: '12px 20px',
          borderRadius: 12,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/workspace')}
            style={{ borderRadius: 6 }}
          >
            返回工作区
          </Button>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1e3a5f' }}>
            {document?.name || '文档'} - 版本历史
          </span>
        </div>
      </div>

      {versions.length === 0 ? (
        <Card style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <Empty description="暂无版本记录" style={{ padding: '60px 0' }} />
        </Card>
      ) : (
        <div style={{ display: 'flex', gap: 20 }}>
          <Card
            style={{
              width: 320,
              borderRadius: 12,
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              flexShrink: 0,
              maxHeight: 'calc(100vh - 180px)',
              overflowY: 'auto',
            }}
            title={
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1e3a5f' }}>
                版本列表
              </span>
            }
          >
            <Timeline
              items={versions.map((v) => ({
                color: selectedVersion?.id === v.id ? '#1e3a5f' : '#d9d9d9',
                dot:
                  selectedVersion?.id === v.id ? (
                    <ClockCircleOutlined style={{ fontSize: 16, color: '#1e3a5f' }} />
                  ) : undefined,
                children: (
                  <div
                    onClick={() => setSelectedVersion(v)}
                    style={{
                      cursor: 'pointer',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background:
                        selectedVersion?.id === v.id ? '#f0f5ff' : 'transparent',
                      border:
                        selectedVersion?.id === v.id
                          ? '1px solid #d6e4ff'
                          : '1px solid transparent',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            selectedVersion?.id === v.id ? '#1e3a5f' : '#333',
                        }}
                      >
                        v{v.versionNumber}
                      </span>
                      {v.isLatest && (
                        <Tag color="blue" style={{ borderRadius: 4, margin: 0 }}>
                          最新
                        </Tag>
                      )}
                    </div>
                    <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                      {dayjs(v.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                    </div>
                  </div>
                ),
              }))}
            />
          </Card>

          <Card
            style={{
              flex: 1,
              borderRadius: 12,
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}
            title={
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1e3a5f' }}>
                {selectedVersion ? `版本 v${selectedVersion.versionNumber} 详情` : '版本详情'}
              </span>
            }
          >
            {selectedVersion ? (
              <>
                <Descriptions
                  bordered
                  column={2}
                  size="middle"
                  labelStyle={{ background: '#fafafa', color: '#666' }}
                >
                  <Descriptions.Item label="版本号">
                    v{selectedVersion.versionNumber}
                  </Descriptions.Item>
                  <Descriptions.Item label="文件名">
                    {selectedVersion.fileName}
                  </Descriptions.Item>
                  <Descriptions.Item label="文件大小">
                    {formatFileSize(selectedVersion.fileSize)}
                  </Descriptions.Item>
                  <Descriptions.Item label="MIME类型">
                    {selectedVersion.mimeType}
                  </Descriptions.Item>
                  <Descriptions.Item label="变更说明" span={2}>
                    {selectedVersion.changeLog || '无'}
                  </Descriptions.Item>
                  <Descriptions.Item label="创建者">
                    {selectedVersion.createdBy}
                  </Descriptions.Item>
                  <Descriptions.Item label="创建时间">
                    {dayjs(selectedVersion.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                  </Descriptions.Item>
                </Descriptions>
                <div
                  style={{
                    marginTop: 24,
                    display: 'flex',
                    gap: 12,
                  }}
                >
                  <Popconfirm
                    title="确定要恢复到此版本吗？"
                    description="恢复后将创建一个新版本"
                    onConfirm={() => handleRestore(selectedVersion)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button
                      type="primary"
                      icon={<RollbackOutlined />}
                      loading={restoring}
                      style={{ background: '#1e3a5f', borderRadius: 6 }}
                    >
                      恢复此版本
                    </Button>
                  </Popconfirm>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={() => handleDownload(selectedVersion)}
                    style={{ borderRadius: 6 }}
                  >
                    下载
                  </Button>
                  <Button
                    icon={<EyeOutlined />}
                    onClick={() => handlePreview(selectedVersion)}
                    style={{ borderRadius: 6 }}
                  >
                    查看内容
                  </Button>
                </div>
              </>
            ) : (
              <Empty description="请选择一个版本查看详情" style={{ padding: '60px 0' }} />
            )}
          </Card>
        </div>
      )}

      <Modal
        title={`版本 v${selectedVersion?.versionNumber} 内容预览`}
        open={previewOpen}
        onCancel={() => {
          setPreviewOpen(false)
          setContentPreview(null)
        }}
        footer={null}
        width={800}
        styles={{ body: { maxHeight: '60vh', overflow: 'auto' } }}
      >
        <Spin spinning={previewLoading}>
          <div
            dangerouslySetInnerHTML={{ __html: contentPreview || '' }}
            style={{
              padding: 16,
              background: '#fafafa',
              borderRadius: 8,
              minHeight: 200,
            }}
          />
        </Spin>
      </Modal>
    </div>
  )
}

export default VersionHistory
