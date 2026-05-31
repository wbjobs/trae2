import React, { useEffect, useState } from 'react'
import {
  Modal,
  List,
  Tag,
  Button,
  Input,
  Form,
  Space,
  message,
  Select,
  Dropdown,
  MenuProps,
} from 'antd'
import {
  BranchesOutlined,
  EditOutlined,
  DeleteOutlined,
  SwapOutlined,
  MergeOutlined,
  PlusOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import {
  branchApi,
  DocumentBranchDTO,
  BranchCreateDTO,
  BranchMergeDTO,
} from '../api/branch'
import { versionApi, DocumentVersionDTO } from '../api/version'
import dayjs from 'dayjs'

interface BranchManagerProps {
  open: boolean
  documentId: string
  currentBranchId?: string
  onClose: () => void
  onSwitch?: (branch: DocumentBranchDTO) => void
  onMerge?: (result: DocumentBranchDTO) => void
}

const BranchManager: React.FC<BranchManagerProps> = ({
  open,
  documentId,
  currentBranchId,
  onClose,
  onSwitch,
  onMerge,
}) => {
  const [branches, setBranches] = useState<DocumentBranchDTO[]>([])
  const [versions, setVersions] = useState<DocumentVersionDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<DocumentBranchDTO | null>(null)
  const [mergeSourceBranch, setMergeSourceBranch] = useState<DocumentBranchDTO | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [mergeForm] = Form.useForm()

  const fetchBranches = async () => {
    if (!documentId) return
    setLoading(true)
    try {
      const data = await branchApi.getList(documentId)
      setBranches(data || [])
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const fetchVersions = async () => {
    if (!documentId) return
    try {
      const data = await versionApi.getVersions(documentId)
      setVersions(data || [])
    } catch {
    }
  }

  useEffect(() => {
    if (open && documentId) {
      fetchBranches()
      fetchVersions()
    }
  }, [open, documentId])

  const handleCreate = async (values: BranchCreateDTO) => {
    if (!documentId) return
    setActionLoading(true)
    try {
      await branchApi.create(documentId, values)
      message.success('分支创建成功')
      setCreateModalOpen(false)
      createForm.resetFields()
      fetchBranches()
    } catch {
    } finally {
      setActionLoading(false)
    }
  }

  const handleEdit = async (values: { name: string; description?: string }) => {
    if (!documentId || !editingBranch) return
    setActionLoading(true)
    try {
      await branchApi.update(documentId, editingBranch.id, values.name, values.description)
      message.success('分支更新成功')
      setEditModalOpen(false)
      setEditingBranch(null)
      editForm.resetFields()
      fetchBranches()
    } catch {
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (branchId: string) => {
    if (!documentId) return
    try {
      await branchApi.delete(documentId, branchId)
      message.success('分支删除成功')
      fetchBranches()
    } catch {
    }
  }

  const handleSwitch = async (branch: DocumentBranchDTO) => {
    if (!documentId) return
    try {
      const result = await branchApi.switchBranch(documentId, branch.id)
      message.success(`已切换到分支: ${branch.name}`)
      onSwitch?.(result)
      fetchBranches()
    } catch {
    }
  }

  const handleMerge = async (values: BranchMergeDTO & { targetBranchId: string }) => {
    if (!documentId || !mergeSourceBranch) return
    setActionLoading(true)
    try {
      const data: BranchMergeDTO = {
        sourceBranchId: mergeSourceBranch.id,
        targetBranchId: values.targetBranchId,
        mergeStrategy: values.mergeStrategy,
        changeLog: values.changeLog,
      }
      const result = await branchApi.merge(documentId, data)
      message.success('分支合并成功')
      setMergeModalOpen(false)
      setMergeSourceBranch(null)
      mergeForm.resetFields()
      fetchBranches()
      onMerge?.(result)
    } catch {
    } finally {
      setActionLoading(false)
    }
  }

  const openEditModal = (branch: DocumentBranchDTO) => {
    setEditingBranch(branch)
    editForm.setFieldsValue({
      name: branch.name,
      description: branch.description,
    })
    setEditModalOpen(true)
  }

  const openMergeModal = (branch: DocumentBranchDTO) => {
    setMergeSourceBranch(branch)
    mergeForm.resetFields()
    setMergeModalOpen(true)
  }

  const getActionsMenu = (branch: DocumentBranchDTO): MenuProps['items'] => [
    {
      key: 'switch',
      icon: <SwapOutlined />,
      label: '切换到此分支',
      disabled: branch.id === currentBranchId || branch.isDefault,
      onClick: () => handleSwitch(branch),
    },
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: '编辑',
      disabled: branch.isDefault,
      onClick: () => openEditModal(branch),
    },
    {
      key: 'merge',
      icon: <MergeOutlined />,
      label: '合并到其他分支',
      disabled: branch.isDefault,
      onClick: () => openMergeModal(branch),
    },
    {
      type: 'divider',
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      disabled: branch.isDefault,
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: '确定要删除此分支吗？',
          content: `删除分支 "${branch.name}" 后，该分支的所有版本将被保留，但分支本身将无法再访问。`,
          okText: '确定删除',
          okType: 'danger',
          cancelText: '取消',
          onOk: () => handleDelete(branch.id),
        })
      },
    },
  ]

  return (
    <>
      <Modal
        title={
          <Space>
            <BranchesOutlined />
            <span>分支管理</span>
          </Space>
        }
        open={open}
        onCancel={onClose}
        footer={null}
        width={720}
        centered
      >
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#666' }}>共 {branches.length} 个分支</span>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalOpen(true)}
            style={{ background: '#1e3a5f', borderRadius: 6 }}
          >
            创建分支
          </Button>
        </div>
        <List
          loading={loading}
          dataSource={branches}
          renderItem={(branch) => (
            <List.Item
              key={branch.id}
              style={{
                padding: '16px 20px',
                border: '1px solid #e8ecf1',
                borderRadius: 8,
                marginBottom: 12,
                background: branch.id === currentBranchId ? '#f0f7ff' : '#fff',
              }}
              actions={[
                <Dropdown
                  menu={{ items: getActionsMenu(branch) }}
                  placement="bottomRight"
                  trigger={['click']}
                >
                  <Button type="text" size="small">
                    操作
                  </Button>
                </Dropdown>,
              ]}
            >
              <List.Item.Meta
                avatar={
                  <BranchesOutlined
                    style={{
                      fontSize: 24,
                      color: branch.isDefault ? '#1e3a5f' : '#888',
                    }}
                  />
                }
                title={
                  <Space>
                    <span style={{ fontWeight: 600, color: '#1e3a5f' }}>
                      {branch.name}
                    </span>
                    {branch.isDefault && (
                      <Tag color="blue" style={{ borderRadius: 4 }}>
                        默认
                      </Tag>
                    )}
                    {branch.id === currentBranchId && (
                      <Tag color="green" style={{ borderRadius: 4 }}>
                        <CheckOutlined /> 当前
                      </Tag>
                    )}
                    {branch.status && branch.status !== 'ACTIVE' && (
                      <Tag color="orange" style={{ borderRadius: 4 }}>
                        {branch.status}
                      </Tag>
                    )}
                  </Space>
                }
                description={
                  <div style={{ marginTop: 8 }}>
                    <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                      {branch.description || '暂无描述'}
                    </div>
                    <Space size="middle" style={{ color: '#999', fontSize: 12 }}>
                      <span>版本数: {branch.versionCount ?? 0}</span>
                      {branch.currentVersionNumber && (
                        <span>当前版本: v{branch.currentVersionNumber}</span>
                      )}
                      {branch.baseVersionNumber && (
                        <span>基于版本: v{branch.baseVersionNumber}</span>
                      )}
                      <span>创建者: {branch.createdBy}</span>
                      <span>创建于: {dayjs(branch.createdAt).format('YYYY-MM-DD HH:mm')}</span>
                    </Space>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Modal>

      <Modal
        title="创建分支"
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false)
          createForm.resetFields()
        }}
        footer={null}
        centered
        width={480}
      >
        <Form form={createForm} onFinish={handleCreate} layout="vertical" style={{ marginTop: 16 }}>
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
              placeholder="选择版本（留空则基于最新版本）"
              allowClear
              style={{ borderRadius: 6 }}
              options={versions.map((v) => ({
                label: `v${v.versionNumber} - ${dayjs(v.createdAt).format('YYYY-MM-DD HH:mm')}`,
                value: v.versionNumber,
              }))}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Button
              onClick={() => {
                setCreateModalOpen(false)
                createForm.resetFields()
              }}
              style={{ marginRight: 8, borderRadius: 6 }}
            >
              取消
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={actionLoading}
              style={{ background: '#1e3a5f', borderRadius: 6 }}
            >
              创建
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑分支"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false)
          setEditingBranch(null)
          editForm.resetFields()
        }}
        footer={null}
        centered
        width={480}
      >
        <Form form={editForm} onFinish={handleEdit} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="分支名称"
            rules={[{ required: true, message: '请输入分支名称' }]}
          >
            <Input placeholder="请输入分支名称" style={{ borderRadius: 6 }} />
          </Form.Item>
          <Form.Item name="description" label="分支描述">
            <Input.TextArea
              placeholder="请输入分支描述（可选）"
              rows={3}
              style={{ borderRadius: 6 }}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Button
              onClick={() => {
                setEditModalOpen(false)
                setEditingBranch(null)
                editForm.resetFields()
              }}
              style={{ marginRight: 8, borderRadius: 6 }}
            >
              取消
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={actionLoading}
              style={{ background: '#1e3a5f', borderRadius: 6 }}
            >
              保存
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="合并分支"
        open={mergeModalOpen}
        onCancel={() => {
          setMergeModalOpen(false)
          setMergeSourceBranch(null)
          mergeForm.resetFields()
        }}
        footer={null}
        centered
        width={480}
      >
        <div style={{ marginBottom: 16, padding: 12, background: '#f6f8fa', borderRadius: 8 }}>
          <span style={{ color: '#666' }}>将分支 </span>
          <Tag color="blue" style={{ borderRadius: 4 }}>
            {mergeSourceBranch?.name}
          </Tag>
          <span style={{ color: '#666' }}> 合并到目标分支</span>
        </div>
        <Form form={mergeForm} onFinish={handleMerge} layout="vertical">
          <Form.Item
            name="targetBranchId"
            label="目标分支"
            rules={[{ required: true, message: '请选择目标分支' }]}
          >
            <Select
              placeholder="选择目标分支"
              style={{ borderRadius: 6 }}
              options={branches
                .filter((b) => b.id !== mergeSourceBranch?.id)
                .map((b) => ({
                  label: b.name + (b.isDefault ? ' (默认)' : ''),
                  value: b.id,
                }))}
            />
          </Form.Item>
          <Form.Item name="mergeStrategy" label="合并策略">
            <Select
              defaultValue="MERGE"
              style={{ borderRadius: 6 }}
              options={[
                { label: '合并提交 (Merge)', value: 'MERGE' },
                { label: '压缩合并 (Squash)', value: 'SQUASH' },
                { label: '变基 (Rebase)', value: 'REBASE' },
              ]}
            />
          </Form.Item>
          <Form.Item name="changeLog" label="变更说明">
            <Input.TextArea
              placeholder="请输入本次合并的变更说明（可选）"
              rows={3}
              style={{ borderRadius: 6 }}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Button
              onClick={() => {
                setMergeModalOpen(false)
                setMergeSourceBranch(null)
                mergeForm.resetFields()
              }}
              style={{ marginRight: 8, borderRadius: 6 }}
            >
              取消
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={actionLoading}
              style={{ background: '#1e3a5f', borderRadius: 6 }}
            >
              合并
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default BranchManager
