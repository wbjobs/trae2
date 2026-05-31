import { Row, Col, Input, Select, Form } from 'antd';
import { Category } from '../types';

const { Option } = Select;

interface BasicInfoFormProps {
  categories: Category[];
}

const BasicInfoForm = ({ categories }: BasicInfoFormProps) => {
  const mainCategories = categories.filter(c => !c.parent_id);
  const subCategories = categories.filter(c => c.parent_id);

  return (
    <>
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
        <Input.TextArea rows={4} placeholder="请输入形态特征描述..." />
      </Form.Item>
    </>
  );
};

export default BasicInfoForm;
