import React, { useState } from 'react'
import { Button, Select, Modal, Input, Space, Tooltip, message, Dropdown, MenuProps } from 'antd'
import {
  EditOutlined,
  SaveOutlined,
  UndoOutlined,
  PlusOutlined,
  DeleteOutlined,
  SettingOutlined,
  DownloadOutlined,
  UploadOutlined,
  LayoutOutlined
} from '@ant-design/icons'
import { useLayoutStore } from '@/store/layoutStore'

interface LayoutToolbarProps {
  userId: string
  onAddWidget?: () => void
}

const LayoutToolbar: React.FC<LayoutToolbarProps> = ({ userId, onAddWidget }) => {
  const {
    currentLayoutId,
    layoutName,
    isEditMode,
    selectedWidgetId,
    savedLayouts,
    templates,
    setEditMode,
    setLayoutName,
    saveLayout,
    resetLayout,
    removeWidget,
    loadLayout,
    loadSavedLayouts,
    loadTemplates
  } = useLayoutStore()

  const [saveModalVisible, setSaveModalVisible] = useState(false)
  const [newLayoutName, setNewLayoutName] = useState('')
  const [layoutLoading, setLayoutLoading] = useState(false)

  React.useEffect(() => {
    loadSavedLayouts(userId)
    loadTemplates()
  }, [userId, loadSavedLayouts, loadTemplates])

  const handleToggleEdit = () => {
    setEditMode(!isEditMode)
    if (isEditMode) {
      message.info('已退出编辑模式')
    } else {
      message.info('已进入编辑模式，可拖拽调整组件位置')
    }
  }

  const handleSaveClick = () => {
    setNewLayoutName(layoutName)
    setSaveModalVisible(true)
  }

  const handleSave = async () => {
    if (!newLayoutName.trim()) {
      message.error('请输入布局名称')
      return
    }

    setLayoutLoading(true)
    try {
      const result = await saveLayout(userId, newLayoutName.trim())
      if (result) {
        message.success('布局保存成功')
        setSaveModalVisible(false)
        setEditMode(false)
      } else {
        message.error('布局保存失败')
      }
    } catch (error) {
      message.error('布局保存失败')
    } finally {
      setLayoutLoading(false)
    }
  }

  const handleLoadLayout = async (layoutId: string) => {
    try {
      await loadLayout(layoutId, userId)
      message.success('布局加载成功')
    } catch (error) {
      message.error('布局加载失败')
    }
  }

  const handleReset = () => {
    Modal.confirm({
      title: '确认重置',
      content: '确定要重置为默认布局吗？所有自定义修改将丢失。',
      onOk: () => {
        resetLayout()
        message.success('已重置为默认布局')
      }
    })
  }

  const handleDeleteWidget = () => {
    if (selectedWidgetId) {
      Modal.confirm({
        title: '删除组件',
        content: '确定要删除选中的组件吗？',
        onOk: () => {
          removeWidget(selectedWidgetId)
          message.success('组件已删除')
        }
      })
    }
  }

  const layoutMenuItems: MenuProps['items'] = [
    {
      key: 'saved',
      label: '我的布局',
      type: 'group' as const,
      children: savedLayouts.map(layout => ({
        key: layout.layout_id,
        label: (
          <span>
            {layout.layout_name}
            {layout.is_default && ' (默认)'}
          </span>
        ),
        onClick: () => handleLoadLayout(layout.layout_id)
      }))
    },
    {
      key: 'templates',
      label: '布局模板',
      type: 'group' as const,
      children: templates.map(template => ({
        key: template.template_id,
        label: (
          <span>
            {template.name}
            <span style={{ color: '#999', marginLeft: 8, fontSize: 12 }}>
              ({template.widget_count}个组件)
            </span>
          </span>
        ),
        onClick: () => handleLoadLayout(template.template_id)
      }))
    }
  ]

  return (
    <>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 8,
        padding: '8px 16px',
        background: 'rgba(15, 52, 96, 0.8)',
        borderBottom: '1px solid rgba(100, 150, 255, 0.3)'
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
          <LayoutOutlined style={{ color: '#4fc3f7', fontSize: 18 }} />
          <Input
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            style={{ width: 200, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff' }}
            placeholder="布局名称"
          />
          <span style={{ color: '#666', fontSize: 12 }}>
            ID: {currentLayoutId}
          </span>
        </div>

        <Space>
          <Dropdown menu={{ items: layoutMenuItems }} placement="bottomRight">
            <Button icon={<DownloadOutlined />} size="small">
              加载布局
            </Button>
          </Dropdown>

          {isEditMode && onAddWidget && (
            <Tooltip title="添加组件">
              <Button
                icon={<PlusOutlined />}
                size="small"
                type="primary"
                onClick={onAddWidget}
              >
                添加组件
              </Button>
            </Tooltip>
          )}

          {isEditMode && selectedWidgetId && (
            <Tooltip title="删除选中组件">
              <Button
                icon={<DeleteOutlined />}
                size="small"
                danger
                onClick={handleDeleteWidget}
              >
                删除
              </Button>
            </Tooltip>
          )}

          <Tooltip title={isEditMode ? '退出编辑' : '编辑布局'}>
            <Button
              icon={<EditOutlined />}
              size="small"
              type={isEditMode ? 'primary' : 'default'}
              onClick={handleToggleEdit}
            >
              {isEditMode ? '完成编辑' : '编辑布局'}
            </Button>
          </Tooltip>

          <Tooltip title="保存布局">
            <Button
              icon={<SaveOutlined />}
              size="small"
              onClick={handleSaveClick}
            >
              保存
            </Button>
          </Tooltip>

          <Tooltip title="重置布局">
            <Button
              icon={<UndoOutlined />}
              size="small"
              onClick={handleReset}
            >
              重置
            </Button>
          </Tooltip>

          <Tooltip title="布局设置">
            <Button
              icon={<SettingOutlined />}
              size="small"
            />
          </Tooltip>

          {isEditMode && (
            <span style={{ color: '#4fc3f7', fontSize: 12, marginLeft: 8 }}>
              编辑模式已开启
            </span>
          )}
        </Space>
      </div>

      <Modal
        title="保存布局"
        open={saveModalVisible}
        onOk={handleSave}
        onCancel={() => setSaveModalVisible(false)}
        confirmLoading={layoutLoading}
        okText="保存"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, color: '#333' }}>
            布局名称
          </label>
          <Input
            value={newLayoutName}
            onChange={(e) => setNewLayoutName(e.target.value)}
            placeholder="请输入布局名称"
            maxLength={50}
          />
        </div>
        {currentLayoutId === 'default' && (
          <div style={{ color: '#faad14', fontSize: 12 }}>
            提示：默认布局不可修改，将另存为新布局
          </div>
        )}
      </Modal>
    </>
  )
}

export default LayoutToolbar
