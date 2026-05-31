import { Row, Col, Input, DatePicker } from 'antd';
import { Form } from 'antd';

interface SurveyInfoFormProps {
  isEdit: boolean;
}

const SurveyInfoForm = () => {
  return (
    <Row gutter={16}>
      <Col xs={24} md={12}>
        <Form.Item name="origin" label="原产地">
          <Input placeholder="如：中国" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item name="habitat" label="生境描述">
          <Input placeholder="如：海拔500-1000米的天然林中" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item name="surveyor" label="调查人">
          <Input placeholder="如：张调查" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item name="survey_date" label="调查日期">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Col>
    </Row>
  );
};

export default SurveyInfoForm;
