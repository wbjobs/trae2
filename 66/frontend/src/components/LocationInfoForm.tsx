import { Row, Col, Input, InputNumber, DatePicker, Button, Tooltip } from 'antd';
import { Form } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';

interface LocationInfoFormProps {
  geocoding: boolean;
  onGeocode: () => void;
}

const LocationInfoForm = ({ geocoding, onGeocode }: LocationInfoFormProps) => {
  return (
    <>
      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Form.Item name="latitude" label="纬度">
            <InputNumber
              style={{ width: '100%' }}
              placeholder="如：31.2304"
              min={-90}
              max={90}
              step={0.0001}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="longitude" label="经度">
            <InputNumber
              style={{ width: '100%' }}
              placeholder="如：121.4737"
              min={-180}
              max={180}
              step={0.0001}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="altitude" label="海拔(m)">
            <InputNumber
              style={{ width: '100%' }}
              placeholder="如：500"
              min={-500}
              max={9000}
            />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item>
        <Tooltip title="根据经纬度自动获取地址信息">
          <Button
            icon={<EnvironmentOutlined />}
            onClick={onGeocode}
            loading={geocoding}
          >
            地理编码获取地址
          </Button>
        </Tooltip>
      </Form.Item>

      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Form.Item name="province" label="省/直辖市">
            <Input placeholder="如：上海市" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="city" label="市">
            <Input placeholder="如：上海市" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="district" label="区/县">
            <Input placeholder="如：浦东新区" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="address" label="详细地址">
        <Input placeholder="如：浦东新区xxx路xxx号" />
      </Form.Item>
    </>
  );
};

export default LocationInfoForm;
