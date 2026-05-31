import React from 'react'
import { Row, Col } from 'antd'
import { ClusterViewComponent } from '../components/lowcode/ClusterViewComponent'
import { FilterComponent } from '../components/lowcode/FilterComponent'

const ClusterPage: React.FC = () => {
  return (
    <Row gutter={16}>
      <Col span={6}>
        <FilterComponent />
      </Col>
      <Col span={18}>
        <ClusterViewComponent />
      </Col>
    </Row>
  )
}

export default ClusterPage