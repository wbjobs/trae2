import { useEffect, useState } from 'react';
import {
  Tree,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  message,
  Card,
  Row,
  Col
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  AppstoreOutlined
} from '@ant-design/icons';
import { categoryApi } from '../services/api';
import { Category, CategoryWithChildren } from '../types';

const CategoryManage = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [treeData, setTreeData] = useState<CategoryWithChildren[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadCategories();
    loadTree();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await categoryApi.getAll();
      if (response.success) {
        setCategories(response.data);
      }
    } catch (error) {
      message.error('加载分类列表失败');
    }
  };

  const loadTree = async () => {
    try {
      const response = await categoryApi.getTree();
      if (response.success) {
        setTreeData(response.data);
      }
    } catch (error) {
      message.error('加载分类树失败');
    }
  };

  const handleAdd = (parentId?: string) => {
    setEditingCategory(null);
    form.resetFields();
    if (parentId) {
      form.setFieldValue('parent_id', parentId);
    }
    setModalVisible(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    form.setFieldsValue(category);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      let response;

      if (editingCategory) {
        response = await categoryApi.update(editingCategory.id, values);
      } else {
        response = await categoryApi.create(values);
      }

      if (response.success) {
        message.success(editingCategory ? '更新成功' : '创建成功');
        setModalVisible(false);
        loadCategories();
        loadTree();
      }
    } catch (error) {
      if (error.errorFields) return;
      message.error(editingCategory ? '更新失败' : '创建失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await categoryApi.delete(id);
      if (response.success) {
        message.success('删除成功');
        loadCategories();
        loadTree();
      }
    } catch (error: any) {
      message.error(error?.response?.data?.error || '删除失败');
    }
  };

  const renderTreeNodes = (data: CategoryWithChildren[]) =>
    data.map(item => ({
      title: (
        <div className="category-tree-node">
          <span>
            {item.code && <span style={{ color: '#999', marginRight: 8 }}>[{item.code}]</span>}
            {item.name}
          </span>
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<PlusOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                handleAdd(item.id);
              }}
            />
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(item);
              }}
            />
            <Popconfirm
              title="确定删除该分类？"
              onConfirm={(e) => {
                e?.stopPropagation();
                handleDelete(item.id);
              }}
              onCancel={(e) => e?.stopPropagation()}
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => e.stopPropagation()}
              />
            </Popconfirm>
          </Space>
        </div>
      ),
      key: item.id,
      children: item.children ? renderTreeNodes(item.children) : []
    }));

  const parentCategories = categories.filter(c => !c.parent_id);

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title="分类树结构"
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => handleAdd()}
              >
                新增根分类
              </Button>
            }
          >
            {treeData.length > 0 ? (
              <Tree
                showLine
                defaultExpandAll
                treeData={renderTreeNodes(treeData)}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                暂无分类数据
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="分类说明">
            <div style={{ padding: '16px 0' }}>
              <p><strong>操作说明：</strong></p>
              <ul style={{ paddingLeft: 20 }}>
                <li>点击 <AppstoreOutlined /> 可查看分类树结构</li>
                <li>点击 <PlusOutlined /> 可添加子分类</li>
                <li>点击 <EditOutlined /> 可编辑分类信息</li>
                <li>点击 <DeleteOutlined /> 可删除分类（无子分类和关联资源时）</li>
              </ul>
              <p style={{ marginTop: 16 }}><strong>分类用途：</strong></p>
              <ul style={{ paddingLeft: 20 }}>
                <li>按植物分类学：科、属、种</li>
                <li>按保护等级：国家一级、国家二级</li>
                <li>按生长类型：针叶树、阔叶树、灌木</li>
              </ul>
            </div>

            <Card title="根分类列表" size="small" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {parentCategories.map(cat => (
                  <span
                    key={cat.id}
                    style={{
                      padding: '4px 12px',
                      background: '#f0f5f0',
                      borderRadius: 4,
                      border: '1px solid #d9e8d9',
                      fontSize: 13
                    }}
                  >
                    {cat.code && <span style={{ color: '#999' }}>[{cat.code}] </span>}
                    {cat.name}
                  </span>
                ))}
              </div>
            </Card>
          </Card>
        </Col>
      </Row>

      <Modal
        title={editingCategory ? '编辑分类' : '新增分类'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="分类名称"
            rules={[{ required: true, message: '请输入分类名称' }]}
          >
            <Input placeholder="如：松科" />
          </Form.Item>
          <Form.Item name="code" label="分类编码">
            <Input placeholder="如：PINACEAE" />
          </Form.Item>
          <Form.Item name="parent_id" label="父级分类">
            <select
              style={{
                width: '100%',
                padding: '5px 11px',
                border: '1px solid #d9d9d9',
                borderRadius: 6
              }}
              defaultValue=""
              {...form.getFieldProps('parent_id')}
            >
              <option value="">无（根分类）</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </Form.Item>
          <Form.Item name="sort_order" label="排序" initialValue={0}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CategoryManage;
