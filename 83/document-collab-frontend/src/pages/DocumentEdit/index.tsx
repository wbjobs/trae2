import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  Button,
  Input,
  Drawer,
  Form,
  message,
  Spin,
  Tag,
  Space,
  Modal,
  Alert,
  Dropdown,
  Select,
} from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  HistoryOutlined,
  ReloadOutlined,
  BranchesOutlined,
  PlusOutlined,
  DownOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import ReactQuill from 'react-quill'
import { documentApi, DocumentDTO } from '../../api/document'
import { versionApi, DocumentVersionDTO } from '../../api/version'
import {
  branchApi,
  DocumentBranchDTO,
  BranchCreateDTO,
} from '../../api/branch'
import BranchManager from '../../components/BranchManager'
import dayjs from 'dayjs'

const DocumentEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [document, setDocument] = useState<DocumentDTO | null>(null)
  const [latestVersion, setLatestVersion] = useState<DocumentVersionDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [conflictInfo, setConflictInfo] = useState<string | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [branches, setBranches] = useState<DocumentBranchDTO[]>([])
  const [currentBranch, setCurrentBranch] = useState<DocumentBranchDTO | null>(null)
  const [createBranchModalOpen, setCreateBranchModalOpen] = useState(false)
  const [branchManagerOpen, setBranchManagerOpen] = useState(false)
  const [createBranchLoading, setCreateBranchLoading] = useState(false)
  const quillRef = useRef<ReactQuill | null>(null)
  const contentRef = useRef<string>('')
  const baseVersionRef = useRef<number | null>(null)
  const documentVersionRef = useRef<number | null>(null)
  const isSettingContent = useRef(false)
  const [form] = Form.useForm()
  const [createBranchForm] = Form.useForm()

  useEffect(() => {
    if (id) {
      loadDocument()
      loadBranches()
    }
  }, [id])

  const handleSwitchBranch = async (branch: DocumentBranchDTO) => {
    if (!id) return
    if (hasUnsavedChanges) {
      Modal.confirm({
        title: '确认切换分支',
        content: '您有未保存的更改，切换分支将丢失当前编辑内容。确定要切换吗？',
        okText: '确定切换',
        cancelText: '取消',
        onOk: async () => {
          await loadDocumentWithBranch(branch.id)
          message.success(`已切换到分支: ${branch.name}`)
        },
      })
      return
    }
    await loadDocumentWithBranch(branch.id)
    message.success(`已切换到分支: ${branch.name}`)
  }

  const handleCreateBranch = async (values: BranchCreateDTO) => {
    if (!id) return
    setCreateBranchLoading(true)
    try {
      await branchApi.create(id, values)
      message.success('分支创建成功')
      setCreateBranchModalOpen(false)
      createBranchForm.resetFields()
      loadBranches()
    } catch {
    } finally {
      setCreateBranchLoading(false)
    }
  }

  const loadBranches = async () => {
    if (!id) return
    try {
      const [branchList, defaultBranch] = await Promise.all([
        branchApi.getList(id),
        branchApi.getDefault(id),
      ])
      setBranches(branchList || [])
      setCurrentBranch(defaultBranch)
    } catch {
    }
  }

  const loadDocument = async () => {
    if (!id) return
    setLoading(true)
    setConflictInfo(null)
    setHasUnsavedChanges(false)
    try {
      const doc = await documentApi.getById(id)
      setDocument(doc)
      documentVersionRef.current = doc.version ?? 0
      try {
        const version = await versionApi.getLatest(id)
        setLatestVersion(version)
        baseVersionRef.current = version.versionNumber
        const versionContent = await versionApi.getContent(id, version.versionNumber)
        setEditorContent(versionContent || '')
      } catch {
        setEditorContent('')
        baseVersionRef.current = null
      }
      setEditorKey((prev) => prev + 1)
    } catch {
      message.error('加载文档失败')
    } finally {
      setLoading(false)
    }
  }

  const loadDocumentWithBranch = async (branchId?: string) => {
    if (!id) return
    if (branchId) {
      try {
        await branchApi.switchBranch(id, branchId)
      } catch {
        return
      }
    }
    await loadDocument()
    await loadBranches()
  }

  const setEditorContent = (html: string) => {
    isSettingContent.current = true
    contentRef.current = html
    const editor = quillRef.current?.getEditor()
    if (editor) {
      editor.root.innerHTML = html
    }
    setTimeout(() => {
      isSettingContent.current = false
    }, 50)
  }

  const handleEditorChange = useCallback((value: string) => {
    if (isSettingContent.current) return
    contentRef.current = value
    if (!hasUnsavedChanges) {
      setHasUnsavedChanges(true)
    }
  }, [hasUnsavedChanges])

  const handleSave = async (values: { changeLog?: string }) => {
    if (!id) return
    setSaving(true)
    try {
      const newVersion = await versionApi.saveContent(
        id,
        contentRef.current,
        values.changeLog,
        documentVersionRef.current ?? undefined
      )
      setLatestVersion(newVersion)
      baseVersionRef.current = newVersion.versionNumber
      documentVersionRef.current = (documentVersionRef.current ?? 0) + 1
      setHasUnsavedChanges(false)
      setLastSavedAt(dayjs().format('HH:mm:ss'))
      setConflictInfo(null)
      message.success('保存成功')
      setDrawerOpen(false)
      form.resetFields()
      const doc = await documentApi.getById(id)
      setDocument(doc)
      documentVersionRef.current = doc.version ?? 0
    } catch (err: any) {
      const errMessage = err?.message || ''
      if (errMessage.includes('已被其他人修改') || errMessage.includes('409')) {
        setConflictInfo('文档已被其他人修改，当前版本已不是最新。请刷新内容后重新编辑，或选择强制覆盖保存。')
        setDrawerOpen(false)
        form.resetFields()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleForceSave = async () => {
    if (!id) return
    setSaving(true)
    try {
      const newVersion = await versionApi.saveContent(id, contentRef.current, '强制覆盖保存')
      setLatestVersion(newVersion)
      baseVersionRef.current = newVersion.versionNumber
      setHasUnsavedChanges(false)
      setLastSavedAt(dayjs().format('HH:mm:ss'))
      setConflictInfo(null)
      message.success('强制保存成功')
      const doc = await documentApi.getById(id)
      setDocument(doc)
      documentVersionRef.current = doc.version ?? 0
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRefreshContent = async () => {
    if (!id) return
    if (hasUnsavedChanges) {
      Modal.confirm({
        title: '确认刷新',
        content: '您有未保存的更改，刷新将丢失当前编辑内容。确定要刷新吗？',
        okText: '确定刷新',
        cancelText: '取消',
        onOk: () => loadDocument(),
      })
    } else {
      loadDocument()
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px - 48px)' }}>
      <div
        style={{
          background: '#fff',
          padding: '12px 20px',
          borderRadius: 12,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
      >
        <Space size="middle">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/workspace')}
            style={{ borderRadius: 6 }}
          >
            返回
          </Button>
          <div>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1e3a5f' }}>
              {document?.name || '文档'}
            </span>
            {latestVersion && (
              <Tag color="blue" style={{ marginLeft: 8, borderRadius: 4 }}>
                v{latestVersion.versionNumber}
              </Tag>
            )}
            {currentBranch && (
              <Dropdown
                menu={{
                  items: [
                    ...branches.map((b) => ({
                      key: b.id,
                      icon: <BranchesOutlined />,
                      label: (
                        <Space>
                          <span>{b.name}</span>
                          {b.isDefault && <Tag color="blue" style={{ borderRadius: 4, padding: '0 4px' }}>默认</Tag>}
                          {b.id === currentBranch?.id && <Tag color="green" style={{ borderRadius: 4, padding: '0 4px' }}>当前</Tag>}
                        </Space>
                      ),
                      disabled: b.id === currentBranch?.id,
                      onClick: () => handleSwitchBranch(b),
                    })),
                    { type: 'divider' as const },
                    {
                      key: 'create',
                      icon: <PlusOutlined />,
                      label: '创建新分支',
                      onClick: () => setCreateBranchModalOpen(true),
                    },
                    {
                      key: 'manage',
                      icon: <BranchesOutlined />,
                      label: '管理分支',
                      onClick: () => setBranchManagerOpen(true),
                    },
                  ],
                }}
                placement="bottomLeft"
                trigger={['click']}
              >
                <Tag
                  color="purple"
                  style={{
                    marginLeft: 8,
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <BranchesOutlined />
                  {currentBranch.name}
                  <DownOutlined style={{ fontSize: 10 }} />
                </Tag>
              </Dropdown>
            )}
            {hasUnsavedChanges && (
              <Tag color="orange" style={{ marginLeft: 4, borderRadius: 4 }}>
                未保存
              </Tag>
            )}
          </div>
        </Space>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefreshContent}
            style={{ borderRadius: 6 }}
            title="刷新为最新版本内容"
          >
            刷新
          </Button>
          <Button
            icon={<HistoryOutlined />}
            onClick={() => navigate(`/documents/${id}/versions`)}
            style={{ borderRadius: 6 }}
          >
            版本历史
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={() => setDrawerOpen(true)}
            style={{ background: '#1e3a5f', borderRadius: 6 }}
          >
            保存
          </Button>
        </Space>
      </div>

      {conflictInfo && (
        <Alert
          message="版本冲突"
          description={conflictInfo}
          type="warning"
          showIcon
          closable
          onClose={() => setConflictInfo(null)}
          action={
            <Space direction="vertical" size={4}>
              <Button size="small" type="primary" onClick={handleRefreshContent}>
                刷新内容
              </Button>
              <Button size="small" danger onClick={handleForceSave}>
                强制覆盖
              </Button>
            </Space>
          }
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}

      <div
        key={editorKey}
        style={{
          flex: 1,
          background: '#fff',
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
      >
        <ReactQuill
          ref={quillRef}
          theme="snow"
          defaultValue={contentRef.current}
          onChange={handleEditorChange}
          style={{
            height: 'calc(100vh - 280px)',
            borderRadius: 12,
          }}
          modules={{
            toolbar: [
              [{ header: [1, 2, 3, 4, 5, 6, false] }],
              ['bold', 'italic', 'underline', 'strike'],
              [{ list: 'ordered' }, { list: 'bullet' }],
              [{ color: [] }, { background: [] }],
              ['link', 'image'],
              ['clean'],
            ],
          }}
        />
      </div>

      <div
        style={{
          background: '#fff',
          padding: '8px 20px',
          borderRadius: 12,
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          color: '#999',
        }}
      >
        <Space size="middle">
          <span>基于版本: v{baseVersionRef.current || '-'}</span>
          <span>最新版本: v{latestVersion?.versionNumber || '-'}</span>
        </Space>
        <span>
          {lastSavedAt ? `上次保存: ${lastSavedAt}` : '未保存'}
        </span>
      </div>

      <Drawer
        title="保存文档"
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false)
          form.resetFields()
        }}
        width={400}
      >
        <Form form={form} onFinish={handleSave} layout="vertical">
          <Form.Item name="changeLog" label="变更说明">
            <Input.TextArea
              placeholder="请输入本次变更的说明（可选）"
              rows={4}
              style={{ borderRadius: 6 }}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={saving}
              block
              style={{ background: '#1e3a5f', borderRadius: 6, height: 40 }}
            >
              确认保存
            </Button>
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title="创建新分支"
        open={createBranchModalOpen}
        onCancel={() => {
          setCreateBranchModalOpen(false)
          createBranchForm.resetFields()
        }}
        footer={null}
        centered
        width={480}
      >
        <Form form={createBranchForm} onFinish={handleCreateBranch} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="分支名称"
            rules={[{ required: true, message: '请输入分支名称' }]}
          >
            <Input placeholder="例如: feature/new-function" style={{ borderRadius: 6 }} />
          </Form.Item>
          <Form.Item name="description" label="分支描述">
            <Input.TextArea
              placeholder="请输入分支描述（可选）"
              rows={3}
              style={{ borderRadius: 6 }}
            />
          </Form.Item>
          <Form.Item name="baseVersionNumber" label="基于版本">
            <Select
              placeholder="选择版本（留空则基于当前版本）"
              allowClear
              style={{ borderRadius: 6 }}
              options={latestVersion ? [
                {
                  label: `v${latestVersion.versionNumber} - 当前版本`,
                  value: latestVersion.versionNumber,
                }
              ] : []}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Button
              onClick={() => {
                setCreateBranchModalOpen(false)
                createBranchForm.resetFields()
              }}
              style={{ marginRight: 8, borderRadius: 6 }}
            >
              取消
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={createBranchLoading}
              style={{ background: '#1e3a5f', borderRadius: 6 }}
            >
              创建
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <BranchManager
        open={branchManagerOpen}
        documentId={id || ''}
        currentBranchId={currentBranch?.id}
        onClose={() => setBranchManagerOpen(false)}
        onSwitch={(branch) => {
          handleSwitchBranch(branch)
        }}
        onMerge={() => {
          loadBranches()
          loadDocument()
        }}
      />
    </div>
  )
}

export default DocumentEdit
